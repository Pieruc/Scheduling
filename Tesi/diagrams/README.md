# Diagrammi della tesi

Sorgenti delle figure generate (le immagini stanno in `../Immagini/`).

| Sorgente | Figura | Comando |
|---|---|---|
| `er.dot` | diagramma ER (Architettura) | `dot -Tpdf er.dot -o ../Immagini/er.pdf` |
| `domain.dot` | classi di pianificazione ed esecuzione (Implementazione) | `dot -Tpdf domain.dot -o ../Immagini/domain.pdf` |
| `seq_*.mmd` | sequence diagram (Metodologie) | `mmdc -i seq_planning.mmd -o ../Immagini/seq_planning.pdf --pdfFit -c mermaid-config.json` |

`dot` è Graphviz; `mmdc` è la CLI di Mermaid (`npm i -g @mermaid-js/mermaid-cli`).
I sequence diagram originali di progetto (SD01–SD05) restano nel progetto Visual Paradigm
(`FlowSync_SequenceDiagrams_VP.xml`); questi sono ridisegnati dal codice implementato.
