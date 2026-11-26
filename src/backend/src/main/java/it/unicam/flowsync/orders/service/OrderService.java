package it.unicam.flowsync.orders.service;

import it.unicam.flowsync.common.error.ApiError;
import it.unicam.flowsync.common.error.ApiException;
import it.unicam.flowsync.configuration.domain.DomainProfile;
import it.unicam.flowsync.configuration.repository.DomainProfileRepository;
import it.unicam.flowsync.orders.domain.WorkOrder;
import it.unicam.flowsync.orders.repository.WorkOrderRepository;
import it.unicam.flowsync.orders.web.OrderDtos.ApiStatus;
import it.unicam.flowsync.orders.web.OrderDtos.OrderRequest;
import it.unicam.flowsync.orders.web.OrderDtos.OrderResponse;
import it.unicam.flowsync.security.domain.AppUser;
import it.unicam.flowsync.security.repository.AppUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Casi d'uso del contratto A.3 sulle commesse. L'id pubblico è il codice (es. "C-101").
 * Conversioni tra API e DB: priority 1/2/3 = LOW/MEDIUM/HIGH, stato OPEN = DRAFT o READY, description = title.
 */
@Service
public class OrderService {

    private final WorkOrderRepository orders;
    private final DomainProfileRepository profiles;
    private final AppUserRepository users;

    public OrderService(WorkOrderRepository orders, DomainProfileRepository profiles, AppUserRepository users) {
        this.orders = orders;
        this.profiles = profiles;
        this.users = users;
    }

    /** Filtri facoltativi: stato del contratto e scadenza prima di una data (le commesse senza scadenza restano fuori). */
    @Transactional(readOnly = true)
    public List<OrderResponse> list(ApiStatus status, OffsetDateTime dueBefore) {
        Map<Long, Long> counts = new HashMap<>();
        for (Object[] row : orders.countActivitiesByOrder()) {
            counts.put((Long) row[0], (Long) row[1]);
        }
        Instant limit = dueBefore == null ? null : dueBefore.toInstant();
        return orders.findAllByOrderByCodeAsc().stream()
                .filter(o -> status == null || toApi(o.getStatus()) == status)
                .filter(o -> limit == null || (o.getDueAt() != null && o.getDueAt().isBefore(limit)))
                .map(o -> toResponse(o, counts.getOrDefault(o.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public OrderResponse get(String code) {
        WorkOrder order = load(code);
        return toResponse(order, orders.countActivities(order.getId()));
    }

    @Transactional
    public OrderResponse create(OrderRequest request, String username) {
        if (orders.existsByCode(request.id())) {
            // contratto A.3 v1.1: codice duplicato = 422 con path, come gli altri errori di validazione
            throw ApiException.unprocessable("Order " + request.id() + " already exists",
                    List.of(new ApiError("DUPLICATE_ORDER", "id", "Order " + request.id() + " already exists")));
        }
        DomainProfile profile = resolveProfile(request);
        WorkOrder order = new WorkOrder();
        order.setCode(request.id());
        copyFields(order, request, profile);
        order.setStatus(WorkOrder.Status.READY);      // OPEN nel contratto
        AppUser author = users.findByUsername(username)
                .orElseThrow(() -> ApiException.unauthorized("User not found or disabled"));
        order.setCreatedBy(author);
        order = orders.save(order);
        return toResponse(order, 0);
    }

    @Transactional
    public OrderResponse update(String code, OrderRequest request) {
        if (!code.equals(request.id())) {
            throw ApiException.unprocessable("The order code cannot be changed",
                    List.of(new ApiError("ID_MISMATCH", "id", "Body id '" + request.id() + "' differs from path id '" + code + "'")));
        }
        WorkOrder order = load(code);
        requireOpenForChanges(order);
        DomainProfile profile = resolveProfile(request);
        copyFields(order, request, profile);
        return toResponse(order, orders.countActivities(order.getId()));
    }

    /** DELETE annulla, non cancella: la commessa resta nello storico dei piani. Idempotente. */
    @Transactional
    public void cancel(String code) {
        WorkOrder order = load(code);
        if (order.getStatus() == WorkOrder.Status.DONE) {
            throw ApiException.conflict("ORDER_DONE", "Order " + code + " is already completed and cannot be cancelled");
        }
        order.setStatus(WorkOrder.Status.CANCELLED);
    }

    @Transactional
    public OrderResponse changePriority(String code, int priority) {
        WorkOrder order = load(code);
        requireOpenForChanges(order);
        order.setPriority(toPriority(priority));
        return toResponse(order, orders.countActivities(order.getId()));
    }

    WorkOrder load(String code) {
        return orders.findByCode(code).orElseThrow(() -> ApiException.notFound("Order " + code + " not found"));
    }

    /** Contratto A.3 v1.1: si modifica solo una commessa OPEN; pianificata, in corso, chiusa o annullata = 409. */
    private static void requireOpenForChanges(WorkOrder order) {
        ApiStatus status = toApi(order.getStatus());
        if (status != ApiStatus.OPEN) {
            throw ApiException.conflict("ORDER_NOT_OPEN", "Order " + order.getCode() + " is " + status + " and cannot be changed");
        }
    }

    private DomainProfile resolveProfile(OrderRequest request) {
        if (request.releaseDate() != null && request.dueDate() != null && request.dueDate().isBefore(request.releaseDate())) {
            throw ApiException.unprocessable("The due date is before the release date",
                    List.of(new ApiError("DUE_BEFORE_RELEASE", "dueDate", "dueDate must not be before releaseDate")));
        }
        if (request.domainProfile() == null || request.domainProfile().isBlank()) {
            return null;
        }
        return profiles.findByCode(request.domainProfile()).orElseThrow(() -> ApiException.unprocessable(
                "Unknown domain profile", List.of(new ApiError("UNKNOWN_PROFILE", "domainProfile",
                        "Domain profile " + request.domainProfile() + " does not exist"))));
    }

    private static void copyFields(WorkOrder order, OrderRequest request, DomainProfile profile) {
        order.setTitle(request.description().trim());
        order.setClientName(request.customer() == null || request.customer().isBlank() ? null : request.customer().trim());
        order.setProfile(profile);
        order.setReleaseAt(request.releaseDate() == null ? null : request.releaseDate().toInstant());
        order.setDueAt(request.dueDate() == null ? null : request.dueDate().toInstant());
        order.setPriority(toPriority(request.priority()));
        order.setWeight(BigDecimal.valueOf(request.weight()).setScale(2, RoundingMode.HALF_UP));
    }

    // ---------------- conversioni API <-> DB ----------------

    static ApiStatus toApi(WorkOrder.Status status) {
        return switch (status) {
            case DRAFT, READY -> ApiStatus.OPEN;
            case PLANNED -> ApiStatus.PLANNED;
            case IN_PROGRESS -> ApiStatus.IN_PROGRESS;
            case DONE -> ApiStatus.DONE;
            case CANCELLED -> ApiStatus.CANCELLED;
        };
    }

    static WorkOrder.Priority toPriority(int priority) {
        return switch (priority) {
            case 1 -> WorkOrder.Priority.LOW;
            case 3 -> WorkOrder.Priority.HIGH;
            default -> WorkOrder.Priority.MEDIUM;
        };
    }

    static int toApi(WorkOrder.Priority priority) {
        return switch (priority) {
            case LOW -> 1;
            case MEDIUM -> 2;
            case HIGH -> 3;
        };
    }

    static OffsetDateTime toApi(Instant instant) {
        return instant == null ? null : OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    static OrderResponse toResponse(WorkOrder o, long activityCount) {
        // releaseDate non ancora inserita: la commessa è disponibile da quando esiste
        Instant release = o.getReleaseAt() != null ? o.getReleaseAt()
                : o.getCreatedAt() != null ? o.getCreatedAt() : Instant.now();
        return new OrderResponse(o.getCode(), o.getClientName(), o.getTitle(),
                o.getProfile() == null ? null : o.getProfile().getCode(),
                toApi(release), toApi(o.getDueAt()), toApi(o.getPriority()), o.getWeight().doubleValue(),
                toApi(o.getStatus()), (int) activityCount);
    }
}
