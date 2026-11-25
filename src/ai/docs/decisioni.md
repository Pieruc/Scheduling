# Decisioni di progetto – parte AI

Scelte prese durante lo sviluppo, con il motivo. Le voci segnate **da
concordare** toccano i contratti condivisi in
[CONTRATTI_API.md](../../../CONTRATTI_API.md) e vanno confermate con il resto del
gruppo.

## 1. Schema delle istanze (contratto D)

**D1 – Un solo schema, scritto come modelli Pydantic.** Le istanze convertite,
quelle generate e in futuro la ProblemSpec usano gli stessi modelli
(`schema.py`). Pydantic controlla la forma del documento; i controlli di
consistenza stanno a parte (`validation.py`) e usano i codici di errore del
contratto B.1, così potranno servire l'endpoint `/validate`.

**D2 – Tempi interi in minuti, ID come stringhe opache.** Come da contratto.
Gli ID generati dai convertitori sono `M1…Mn` per le macchine (con zeri a
sinistra se servono, così l'ordine alfabetico è quello numerico), `J1…` per i
job e `J1-O1…` per le attività. Nei file job shop le macchine partono da 0:
la macchina 0 diventa `M1`.

**D3 – Differenze dal contratto v1** (*da concordare*):

| Modifica | Motivo |
|---|---|
| `jobs[].due_min` può essere nullo | i benchmark classici non hanno scadenze |
| `resources[].availability` può essere nulla (= sempre disponibile) | i benchmark non hanno calendari |
| nuovo codice di errore `DUPLICATE_ID` | gli altri controlli presuppongono ID unici |
| `source.best_known.lower_bound` | serve a calcolare il gap quando l'ottimo non è noto |
| `objective_weights` anche nell'istanza | il generatore estrae pesi casuali per ogni istanza |

**D4 – Estensioni necessarie per PSPLIB e MSLIB** (*da concordare, non
ancora fatte*). Lo schema attuale non le può rappresentare:

- PSPLIB: un'attività usa più risorse insieme, ognuna in una certa quantità.
  Proposta: lista `quantities` nel modo, della stessa lunghezza di
  `resource_ids`, con 1 come valore di default.
- MSLIB: un'attività chiede un numero di persone per competenza, con un
  livello minimo. Proposta: lista di fabbisogni `{competenza, persone, livello}`
  nell'attività e livello per competenza nelle risorse.

Entrambi i campi sarebbero facoltativi, così le istanze esistenti restano valide.

**D5 – Setup elencati coppia per coppia.** Lo schema vuole una voce per ogni
coppia di attività su ogni risorsa. Con il generatore si arriva a 3208 voci e
456 KB per una sola istanza. Una matrice per famiglie di attività sarebbe molto
più compatta (*proposta da concordare*).

## 2. Convertitori

**C1 – I dati grezzi stanno fuori da git.** I dataset sono in `Dataset/`
accanto alla repo; nella repo vanno solo i convertitori. `ai/data/`, dove
finiscono le istanze convertite e generate, è esclusa da git. Motivo:
dimensioni e licenze non verificate.

**C2 – Un file non valido non viene scritto.** Ogni istanza convertita passa
dal validatore; se fallisce viene segnalata e saltata.

**C3 – `best_known` solo da fonti citabili.** I valori noti vengono letti da
`instances.json` di JSPLIB, non scritti a mano. Per FJSP e Demirkol
`best_known` resta vuoto finché non si trova una fonte.

**C4 – PSPLIB solo a modo singolo.** Il multi-modo non è stato scaricato:
introduce risorse non rinnovabili (un budget che si consuma sull'intero
progetto), che lo schema non prevede. Le alternative di esecuzione sono già
coperte dalle istanze FJSP. `dataset.txt` va corretto di conseguenza.

## 3. Generatore

**G1 – Riproducibile.** Un'istanza dipende solo da profilo e seed, così ogni
dataset di training si può ricostruire.

**G2 – Due profili.**

- `FACTORY`: macchine con 1–3 alternative per attività, catene di attività per
  job, setup tra famiglie di attività nella metà delle istanze.
- `PA`: persone con 1–3 competenze, ogni attività svolgibile da chiunque abbia
  la competenza richiesta, pratiche con rami paralleli (25%), nessun setup,
  ritardo più importante del makespan nei pesi.

I valori degli intervalli sono scelti dal gruppo, non ricavati da dati reali.
Sono piccoli di proposito: le istanze di training devono poter essere risolte
da CP-SAT all'ottimo in tempi brevi.

**G3 – Pesi degli obiettivi casuali.** Estratti da una distribuzione di
Dirichlet per profilo; il peso del setup è 0 nelle istanze senza setup. Così lo
stesso modello impara combinazioni diverse di obiettivi.

**G4 – Scadenze calcolate dal carico** (17 novembre, sostituisce la versione
precedente). Formula:

> scadenza = rilascio + cammino critico del job + s × makespan stimato

con il makespan stimato pari al massimo tra carico medio per risorsa e job più
lungo, e `s` estratto da `due_slack` (FACTORY 0–0,6, PA 0–0,4). La versione
precedente usava solo il cammino critico del job e ignorava la coda sulle
risorse condivise: con EDD il ritardo risultava zero nel 61% delle istanze
FACTORY e nel 79% delle PA, che quindi non insegnavano nulla sul ritardo.
Misure in [esperimenti.md](esperimenti.md), voce E4. Un test fallisce se le
istanze senza ritardo tornano sopra il 30%.

**G5 – Taratura parziale.** La taratura modifica solo ciò che i benchmark
contengono davvero (dimensioni, flessibilità, durate). Il profilo PA non è
tarato: i log BPIC sono previsti a dicembre (task 11) e MSLIB non è convertito.

## 4. Dispatcher e regole

**R1 – Ammissibile per costruzione.** Il Dispatcher propone solo mosse lecite
(attività pronta, modo, inizio più anticipato); chi decide sceglie tra queste.
Lo stesso meccanismo servirà alla policy M2.

**R2 – Insieme di candidati attivo.** Si propongono solo i candidati che
iniziano prima della fine più anticipata tra tutti (insieme di conflitto di
Giffler-Thompson): un candidato che parte più tardi lascerebbe una risorsa
ferma senza motivo. Con `candidates(active_only=False)` si ottengono tutti.

**R3 – Accodamento senza inserimento.** Su ogni risorsa le attività vengono
accodate dopo l'ultima, mai inserite in un intervallo libero precedente.
È la scelta usuale per il dispatching; si perde un po' di qualità rispetto a
CP-SAT.

**R4 – Setup anticipabili.** Il setup si esegue sulla risorsa appena libera,
prima dell'attività, anche se l'attività aspetta ancora un predecessore.

**R5 – Ritardo massimo non gestito nelle scelte.** `max_lag_min` non guida il
Dispatcher; se a fine piano risulta violato, il piano è dichiarato INFEASIBLE.
Oggi nessuna istanza contiene questo vincolo.

**R6 – Verifica indipendente.** `checker.py` ricontrolla ogni piano senza
riusare il codice del Dispatcher, così un errore lì non si ripete anche qui.
Se la verifica fallisce il risultato è INFEASIBLE: il contratto B.2 garantisce
che un piano OK sia sempre ammissibile. Limite: i setup sono controllati solo
sulle risorse con capacità 1.

**R7 – Regole e spareggi.**

- EDD: scadenza del job più vicina. Senza scadenze diventa "prima chi finisce prima".
- ATC: indice (peso ÷ durata) × exp(−margine ÷ (k × durata media residua)),
  con margine = scadenza − (fine + lavoro minimo che resta nel job). Senza
  scadenze diventa peso ÷ durata. `k` di default 2. La regola sceglie
  l'attività; il modo è quello che finisce prima, e l'indice di ogni attività
  si calcola su quel modo. Confrontare tutti i modi tra loro premiava quelli
  che finiscono più tardi (correzione del 17 novembre, esperimento E5).
- A parità di priorità vince chi finisce prima, poi l'ordine dell'istanza:
  i risultati sono deterministici.

**R8 – KPI.** Calcolati come nel contratto B.2. I tempi partono da 0; il
ritardo conta solo i job con scadenza; l'utilizzo è il tempo di lavorazione
diviso (capacità × makespan), setup esclusi.

## 5. Teacher CP-SAT

**T1 – Obiettivo composto.** Per confrontare piani di solutori diversi serve un
solo numero: `costo = Σ w_k × KPI_k ÷ scala_k` su makespan, ritardo pesato e
setup, con `w_k` = `objective_weights` dell'istanza (benchmark: solo makespan).
Le scale dipendono solo dall'istanza, così lo stesso piano ha sempre lo stesso
costo: lower bound del makespan; somma dei pesi dei job con scadenza × durata
media; numero di attività × setup medio (`objective.py`). Alternativa scartata:
normalizzare sul piano di ATC, che rende il costo dipendente da un'euristica e
instabile quando ATC ha ritardo nullo. **Da concordare**: il contratto B non
dice come si combinano i pesi degli obiettivi.

**T2 – Modello.** Stessi vincoli del Dispatcher: un intervallo opzionale per
modo eseguibile (esattamente uno scelto), NoOverlap per capacità 1, Cumulative
per capacità > 1, buchi tra le finestre di disponibilità come intervalli fissi.
In più gestisce `max_lag_min`, che il Dispatcher non sa rispettare. I setup
dipendenti dalla sequenza usano un vincolo Circuit per risorsa e valgono solo
con capacità 1, come nel controllo dei piani (R6).

**T3 – Hint dalle regole.** Il miglior piano tra EDD, ATC k = 1 e ATC k = 2 è
passato a CP-SAT come soluzione di partenza. Garantisce un piano almeno buono
quanto le regole anche quando il tempo finisce, e fa partire la ricerca da una
soluzione ammissibile. L'orizzonte del modello è sempre ≥ makespan dell'hint.

**T4 – Compattazione.** Se il makespan non è nell'obiettivo, CP-SAT può
lasciare attività in attesa senza motivo. Il piano viene compattato a sinistra
mantenendo modi e ordine sulle risorse: il costo non peggiora e il Dataset
Builder vede un ordine di scelta più pulito. Solo con capacità 1; se il piano
compattato viola un vincolo si tiene l'originale.

**T5 – Tempo e determinismo.** Default 10 s per istanza e 8 thread. Con più
thread CP-SAT non è deterministico: due esecuzioni possono dare piani diversi
quando l'ottimo non è dimostrato. Per riproducibilità le soluzioni si salvano
su disco (un JSON per istanza, con parametri e versione di OR-Tools) e il
dataset si costruisce da quelle; con `--workers 1` il risultato è ripetibile.

**T6 – Gap.** Il gap riportato è quello di CP-SAT tra soluzione e lower bound
dimostrato. Con i setup il lower bound è debole: un gap alto non vuol dire per
forza una soluzione cattiva (vedi E6).

## 6. Dataset per la policy M2

**S1 – Etichette per imitazione.** Il piano del teacher viene rigiocato nel
Dispatcher. A ogni passo l'etichetta 1 va al candidato dell'attività che il
teacher fa iniziare per prima tra quelle candidate, col modo del teacher (se
non è tra i candidati, quello che finisce prima). Così le etichette stanno
sempre tra le mosse che la policy vedrà online, e il piano rigiocato misura il
massimo raggiungibile da un imitatore perfetto (`replay_cost` nel manifest).
Alternativa scartata: usare direttamente gli inizi del teacher, che possono
non corrispondere a nessun candidato del Dispatcher (risorse accodate, insieme
attivo).

**S2 – Un gruppo per passo.** Ogni passo è una query di ranking: più righe
(candidati), una sola con etichetta 1. Formato pensato per ranker listwise o
pairwise (LightGBM `lambdarank`, rete con softmax sui candidati). La colonna
`teacher_rank` dà anche l'ordine completo del teacher tra i candidati.

**S3 – Feature senza scala.** Tempi divisi per la durata media residua e
misurati dall'istante di decisione; ranghi normalizzati tra i candidati; pesi
degli obiettivi come feature di stato (il modello deve adattarsi ai pesi,
architettura §7). Le feature sono calcolate da `features.py`, che userà anche
la policy online: training e inferenza vedono gli stessi numeri.

**S4 – Split per istanza.** Train/validation/test 70/15/15, deciso dallo
sha256 di seme e nome dell'istanza: mai passi della stessa istanza in split
diversi, e aggiungere istanze non sposta quelle già assegnate.

**S5 – Versioni.** Ogni dataset sta in `data/datasets/<versione>/` con
`manifest.json` (sorgenti, filtri, split, descrizione delle feature, conteggi,
sha256 dei CSV, una riga per istanza con costo del teacher, delle regole e del
rigiocato). Una versione esistente non si sovrascrive senza `--overwrite`.

## 7. Non ancora gestito

- `fixed_assignments` (attività congelate per la rischedulazione): presenti
  nella ProblemSpec, assenti nello schema delle istanze e nel Dispatcher.
- `horizon` e `options` della ProblemSpec: non usati.
- Durate nulle (da stimare con M1): i modi senza durata vengono ignorati dal
  Dispatcher.
- Stati fuori dalla traiettoria del teacher: il dataset contiene solo gli stati
  che si incontrano seguendo il teacher. Quando la policy sbaglia finisce in
  stati mai visti. Soluzione prevista dopo il primo modello: DAgger (far
  scegliere la policy, chiedere al teacher la mossa giusta da quegli stati e
  aggiungerli al dataset).
- Setup su risorse con capacità > 1: ignorati dal teacher e dal controllo.
