package it.unicam.flowsync.orders.web;

import it.unicam.flowsync.common.web.ApiPaths;
import it.unicam.flowsync.orders.service.OrderService;
import it.unicam.flowsync.orders.service.ProcessGraphService;
import it.unicam.flowsync.orders.web.OrderDtos.ApiStatus;
import it.unicam.flowsync.orders.web.OrderDtos.OrderRequest;
import it.unicam.flowsync.orders.web.OrderDtos.OrderResponse;
import it.unicam.flowsync.orders.web.OrderDtos.PriorityRequest;
import it.unicam.flowsync.orders.web.OrderDtos.ProcessGraphDto;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.List;

/** Contratto A.3: commesse e grafo di processo, per PLANNER e ADMIN. */
@RestController
@RequestMapping(ApiPaths.V1 + "/orders")
@PreAuthorize("hasAnyRole('PLANNER', 'ADMIN')")
public class OrderController {

    private final OrderService orders;
    private final ProcessGraphService graphs;

    public OrderController(OrderService orders, ProcessGraphService graphs) {
        this.orders = orders;
        this.graphs = graphs;
    }

    /** GET /orders?status=OPEN&dueBefore=2026-12-01T00:00:00Z (nell'URL il "+" di un fuso va scritto %2B). */
    @GetMapping
    public List<OrderResponse> list(@RequestParam(required = false) ApiStatus status,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                                    OffsetDateTime dueBefore) {
        return orders.list(status, dueBefore);
    }

    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable String id) {
        return orders.get(id);
    }

    @PostMapping
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody OrderRequest request, @AuthenticationPrincipal Jwt user) {
        OrderResponse created = orders.create(request, user.getSubject());
        return ResponseEntity.created(URI.create(ApiPaths.V1 + "/orders/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    public OrderResponse update(@PathVariable String id, @Valid @RequestBody OrderRequest request) {
        return orders.update(id, request);
    }

    /** Annulla la commessa (stato CANCELLED), non la cancella. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable String id) {
        orders.cancel(id);
    }

    @PatchMapping("/{id}/priority")
    public OrderResponse changePriority(@PathVariable String id, @Valid @RequestBody PriorityRequest request) {
        return orders.changePriority(id, request.priority());
    }

    @GetMapping("/{id}/process-graph")
    public ProcessGraphDto getGraph(@PathVariable String id) {
        return graphs.get(id);
    }

    /** Sostituisce il grafo; 422 con l'elenco degli errori se ci sono cicli o riferimenti sbagliati. */
    @PutMapping("/{id}/process-graph")
    public ProcessGraphDto replaceGraph(@PathVariable String id, @Valid @RequestBody ProcessGraphDto graph) {
        return graphs.replace(id, graph);
    }
}
