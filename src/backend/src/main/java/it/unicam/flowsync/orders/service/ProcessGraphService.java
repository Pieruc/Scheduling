package it.unicam.flowsync.orders.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.Skill;
import it.unicam.flowsync.configuration.repository.ResourceRepository;
import it.unicam.flowsync.configuration.repository.SkillRepository;
import it.unicam.flowsync.orders.domain.Activity;
import it.unicam.flowsync.orders.domain.ActivityResource;
import it.unicam.flowsync.orders.domain.Precedence;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.orders.repository.PrecedenceRepository;
import it.unicam.flowsync.orders.repository.WorkOrderRepository;
import it.unicam.flowsync.orders.web.OrderDtos.ActivityDto;
import it.unicam.flowsync.orders.web.OrderDtos.ModeDto;
import it.unicam.flowsync.orders.web.OrderDtos.PrecedenceDto;
import it.unicam.flowsync.orders.web.OrderDtos.ProcessGraphDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * GET / PUT /orders/{id}/process-graph (contratto A.3): attività con i loro modi e precedenze.
 * Il PUT sostituisce tutto il grafo, ma per codice: le attività che restano conservano id e famiglia di setup,
 * così i riferimenti dei piani non si perdono. Un grafo con cicli o riferimenti sbagliati è rifiutato con 422.
 */
@Service
public class ProcessGraphService {

    private final OrderService orderService;
    private final WorkOrderRepository orders;
    private final PrecedenceRepository precedences;
    private final ResourceRepository resources;
    private final SkillRepository skills;

    public ProcessGraphService(OrderService orderService, WorkOrderRepository orders, PrecedenceRepository precedences,
                               ResourceRepository resources, SkillRepository skills) {
        this.orderService = orderService;
        this.orders = orders;
        this.precedences = precedences;
        this.resources = resources;
        this.skills = skills;
    }

    @Transactional(readOnly = true)
    public ProcessGraphDto get(String code) {
        WorkOrder order = orderService.load(code);
        return toDto(order, precedences.findByOrder(order));
    }

    @Transactional
    public ProcessGraphDto replace(String code, ProcessGraphDto graph) {
        WorkOrder order = orderService.load(code);
        if (order.getStatus() != WorkOrder.Status.DRAFT && order.getStatus() != WorkOrder.Status.READY) {
            throw ApiException.conflict("ORDER_NOT_EDITABLE",
                    "The process graph of order " + code + " can be changed only while the order is OPEN");
        }

        // 1. controlli: struttura (classe pura) e riferimenti a risorse e competenze (DB)
        List<ApiError> errors = new ArrayList<>(GraphValidator.validate(nodes(graph), edges(graph)).stream()
                .map(p -> new ApiError(p.code(), p.path(), p.message())).toList());
        Map<String, Resource> resourceByCode = resolveResources(graph, errors);
        Map<String, Skill> skillByCode = resolveSkills(graph, errors);
        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("The process graph contains " + errors.size()
                    + (errors.size() == 1 ? " error" : " errors"), errors);
        }

        // 2. via le precedenze vecchie, scritte subito: le nuove possono ripetere le stesse coppie (vincolo unico)
        precedences.deleteAll(precedences.findByOrder(order));
        precedences.flush();

        // 3. attività: si tolgono quelle sparite, si aggiornano quelle rimaste, si creano le nuove
        Set<String> wanted = graph.activities().stream().map(ActivityDto::id).collect(Collectors.toSet());
        order.getActivities().removeIf(a -> !wanted.contains(a.getCode()));
        Map<String, Activity> byCode = order.getActivities().stream()
                .collect(Collectors.toMap(Activity::getCode, Function.identity()));
        for (ActivityDto dto : graph.activities()) {
            Activity activity = byCode.get(dto.id());
            if (activity == null) {
                activity = new Activity();
                activity.setCode(dto.id());
                order.addActivity(activity);
                byCode.put(dto.id(), activity);
            }
            activity.setName(dto.name().trim());
            if (dto.setupFamily() != null) {
                activity.setSetupFamily(dto.setupFamily().isBlank() ? null : dto.setupFamily().trim());
            }
            activity.setRequiredSkills(dto.requiredSkills().stream().distinct()
                    .map(skillByCode::get).collect(Collectors.toCollection(LinkedHashSet::new)));
            activity.setDeclaredDurationMin(commonDuration(dto.modes()));
        }
        // la commessa è gestita: flush (non save, che farebbe merge e copierebbe le attività nuove, lasciando
        // in byCode istanze non salvate) persiste per cascata le attività nuove, che ricevono l'id
        orders.flush();

        // 4. modi: allineati per risorsa (aggiornare invece di ricreare evita conflitti sulla chiave)
        for (ActivityDto dto : graph.activities()) {
            syncModes(byCode.get(dto.id()), dto.modes(), resourceByCode);
        }
        orders.flush();

        // 5. precedenze nuove
        List<Precedence> created = new ArrayList<>();
        for (PrecedenceDto p : graph.precedences()) {
            Precedence edge = new Precedence();
            edge.setPredecessor(byCode.get(p.from()));
            edge.setSuccessor(byCode.get(p.to()));
            edge.setLagMin(p.minLagMin() == null ? 0 : p.minLagMin());
            edge.setMaxLagMin(p.maxLagMin());
            created.add(edge);
        }
        precedences.saveAll(created);
        return toDto(order, created);
    }

    // ---------------- passi del PUT ----------------

    private static List<GraphValidator.Node> nodes(ProcessGraphDto graph) {
        return graph.activities().stream()
                .map(a -> new GraphValidator.Node(a.id(), a.modes().stream()
                        .map(m -> new GraphValidator.Mode(m.resourceIds(), m.durationMin())).toList()))
                .toList();
    }

    private static List<GraphValidator.Edge> edges(ProcessGraphDto graph) {
        return graph.precedences().stream()
                .map(p -> new GraphValidator.Edge(p.from(), p.to(), p.type(), p.minLagMin(), p.maxLagMin()))
                .toList();
    }

    private Map<String, Resource> resolveResources(ProcessGraphDto graph, List<ApiError> errors) {
        Set<String> codes = new HashSet<>();
        graph.activities().forEach(a -> a.modes().forEach(m -> codes.addAll(m.resourceIds())));
        Map<String, Resource> found = resources.findByCodeIn(codes).stream()
                .collect(Collectors.toMap(Resource::getCode, Function.identity()));
        for (int i = 0; i < graph.activities().size(); i++) {
            List<ModeDto> modes = graph.activities().get(i).modes();
            for (int j = 0; j < modes.size(); j++) {
                List<String> ids = modes.get(j).resourceIds();
                for (int k = 0; k < ids.size(); k++) {
                    Resource r = found.get(ids.get(k));
                    String path = "activities[" + i + "].modes[" + j + "].resourceIds[" + k + "]";
                    if (r == null) {
                        errors.add(new ApiError("UNKNOWN_RESOURCE", path, "Resource " + ids.get(k) + " does not exist"));
                    } else if (!r.isActive()) {
                        errors.add(new ApiError("INACTIVE_RESOURCE", path, "Resource " + ids.get(k) + " is deactivated"));
                    }
                }
            }
        }
        return found;
    }

    private Map<String, Skill> resolveSkills(ProcessGraphDto graph, List<ApiError> errors) {
        Set<String> codes = new HashSet<>();
        graph.activities().forEach(a -> codes.addAll(a.requiredSkills()));
        Map<String, Skill> found = skills.findByCodeIn(codes).stream()
                .collect(Collectors.toMap(Skill::getCode, Function.identity()));
        for (int i = 0; i < graph.activities().size(); i++) {
            List<String> required = graph.activities().get(i).requiredSkills();
            for (int k = 0; k < required.size(); k++) {
                if (!found.containsKey(required.get(k))) {
                    errors.add(new ApiError("UNKNOWN_SKILL", "activities[" + i + "].requiredSkills[" + k + "]",
                            "Skill " + required.get(k) + " does not exist"));
                }
            }
        }
        return found;
    }

    /** Se tutti i modi hanno la stessa durata, quella è la durata dichiarata dell'attività; altrimenti null. */
    private static Integer commonDuration(List<ModeDto> modes) {
        Set<Integer> durations = modes.stream().map(ModeDto::durationMin).collect(Collectors.toSet());
        return durations.size() == 1 ? durations.iterator().next() : null;
    }

    private static void syncModes(Activity activity, List<ModeDto> modes, Map<String, Resource> resourceByCode) {
        Map<String, Integer> wanted = new LinkedHashMap<>();
        modes.forEach(m -> wanted.put(m.resourceIds().get(0), m.durationMin()));
        activity.getModes().removeIf(m -> !wanted.containsKey(m.getResource().getCode()));
        Map<String, ActivityResource> present = new HashMap<>();
        activity.getModes().forEach(m -> present.put(m.getResource().getCode(), m));
        wanted.forEach((code, duration) -> {
            ActivityResource mode = present.get(code);
            if (mode == null) {
                activity.getModes().add(new ActivityResource(activity, resourceByCode.get(code), duration));
            } else {
                mode.setDurationMin(duration);
            }
        });
    }

    // ---------------- lettura ----------------

    private static ProcessGraphDto toDto(WorkOrder order, List<Precedence> edges) {
        List<ActivityDto> activities = order.getActivities().stream()
                .sorted(Comparator.comparing(Activity::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(ProcessGraphService::toDto)
                .toList();
        List<PrecedenceDto> precedenceDtos = edges.stream()
                .map(p -> new PrecedenceDto(p.getPredecessor().getCode(), p.getSuccessor().getCode(), "FS",
                        p.getLagMin(), p.getMaxLagMin()))
                .toList();
        return new ProcessGraphDto(activities, precedenceDtos);
    }

    private static ActivityDto toDto(Activity a) {
        List<ModeDto> modes = a.getModes().stream()
                .sorted(Comparator.comparing(m -> m.getResource().getCode()))
                .map(m -> new ModeDto(List.of(m.getResource().getCode()),
                        // null = durata da stimare (M1): ammesso dal contratto A.3
                        m.getDurationMin() != null ? m.getDurationMin() : a.getDeclaredDurationMin()))
                .toList();
        List<String> skillCodes = a.getRequiredSkills().stream().map(Skill::getCode).sorted().toList();
        return new ActivityDto(a.getCode(), a.getName(), skillCodes, modes, a.getSetupFamily());
    }
}
