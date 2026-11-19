package it.unicam.flowsync.configuration.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.Resource;
import it.unicam.flowsync.configuration.domain.ResourceSkill;
import it.unicam.flowsync.configuration.domain.Skill;
import it.unicam.flowsync.configuration.domain.WorkCalendar;
import it.unicam.flowsync.configuration.repository.CalendarRepository;
import it.unicam.flowsync.configuration.repository.ResourceRepository;
import it.unicam.flowsync.configuration.repository.SkillRepository;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.ResourceRequest;
import it.unicam.flowsync.configuration.web.ConfigurationDtos.ResourceResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Casi d'uso del contratto A.2 sulle risorse. L'id pubblico è il codice (es. "R-CNC-01"), non la chiave numerica. */
@Service
public class ResourceService {

    private static final int DEFAULT_SKILL_LEVEL = 1;

    private final ResourceRepository resources;
    private final SkillRepository skills;
    private final CalendarRepository calendars;

    public ResourceService(ResourceRepository resources, SkillRepository skills, CalendarRepository calendars) {
        this.resources = resources;
        this.skills = skills;
        this.calendars = calendars;
    }

    /** @param active se non nullo, filtra le risorse attive o disattivate */
    @Transactional(readOnly = true)
    public List<ResourceResponse> list(Boolean active) {
        List<Resource> found = active == null
                ? resources.findAllByOrderByCodeAsc()
                : resources.findAllByActiveOrderByCodeAsc(active);
        return found.stream().map(ResourceResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ResourceResponse get(String code) {
        return ResourceResponse.from(load(code));
    }

    @Transactional
    public ResourceResponse create(ResourceRequest request) {
        if (resources.existsByCode(request.id())) {
            throw ApiException.conflict("DUPLICATE_RESOURCE", "Resource " + request.id() + " already exists");
        }
        Referenced refs = resolve(request);
        Resource resource = new Resource();
        resource.setCode(request.id());
        copyFields(resource, request, refs.calendar());
        resource = resources.save(resource);           // serve l'id prima di collegare le competenze
        syncSkills(resource, refs.skills());
        return ResourceResponse.from(resource);
    }

    @Transactional
    public ResourceResponse update(String code, ResourceRequest request) {
        if (!code.equals(request.id())) {
            throw ApiException.unprocessable("The resource code cannot be changed",
                    List.of(new ApiError("ID_MISMATCH", "id", "Body id '" + request.id() + "' differs from path id '" + code + "'")));
        }
        Resource resource = load(code);
        Referenced refs = resolve(request);
        copyFields(resource, request, refs.calendar());
        syncSkills(resource, refs.skills());
        return ResourceResponse.from(resource);
    }

    /** DELETE non cancella (contratto A.2): la risorsa resta nei piani passati, ma non si assegna più. Idempotente. */
    @Transactional
    public void deactivate(String code) {
        load(code).setActive(false);
    }

    private Resource load(String code) {
        return resources.findByCode(code)
                .orElseThrow(() -> ApiException.notFound("Resource " + code + " not found"));
    }

    private static void copyFields(Resource resource, ResourceRequest request, WorkCalendar calendar) {
        resource.setName(request.name());
        resource.setType(request.type());
        resource.setCapacity(request.capacity());
        resource.setCalendar(calendar);
    }

    /** Calendario e competenze citati nella richiesta: se uno non esiste, 422 con un errore per ogni riferimento. */
    private Referenced resolve(ResourceRequest request) {
        List<ApiError> errors = new ArrayList<>();

        WorkCalendar calendar = null;
        try {
            calendar = calendars.findById(Long.parseLong(request.calendarId())).orElse(null);
        } catch (NumberFormatException ignored) {
            // un id non numerico non può esistere: stesso errore di un id sconosciuto
        }
        if (calendar == null) {
            errors.add(new ApiError("UNKNOWN_CALENDAR", "calendarId", "Calendar " + request.calendarId() + " does not exist"));
        }

        Set<String> wanted = new LinkedHashSet<>(request.skills());
        Map<String, Skill> found = skills.findByCodeIn(wanted).stream()
                .collect(Collectors.toMap(Skill::getCode, s -> s));
        int index = 0;
        for (String code : request.skills()) {
            if (!found.containsKey(code)) {
                errors.add(new ApiError("UNKNOWN_SKILL", "skills[" + index + "]", "Skill " + code + " does not exist"));
            }
            index++;
        }

        if (!errors.isEmpty()) {
            throw ApiException.unprocessable("The resource refers to " + errors.size() + " unknown "
                    + (errors.size() == 1 ? "item" : "items"), errors);
        }
        Map<String, Skill> ordered = new LinkedHashMap<>();
        wanted.forEach(code -> ordered.put(code, found.get(code)));
        return new Referenced(calendar, ordered);
    }

    /** Allinea le competenze della risorsa a quelle richieste; quelle già presenti conservano il loro livello. */
    private static void syncSkills(Resource resource, Map<String, Skill> wanted) {
        resource.getSkills().removeIf(rs -> !wanted.containsKey(rs.getSkill().getCode()));
        Set<String> present = resource.getSkills().stream()
                .map(rs -> rs.getSkill().getCode())
                .collect(Collectors.toSet());
        wanted.forEach((code, skill) -> {
            if (!present.contains(code)) {
                resource.getSkills().add(new ResourceSkill(resource, skill, DEFAULT_SKILL_LEVEL));
            }
        });
    }

    private record Referenced(WorkCalendar calendar, Map<String, Skill> skills) {
    }
}
