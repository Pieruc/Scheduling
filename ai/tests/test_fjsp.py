import json
import os
from pathlib import Path

import pytest

from p06_ai.converters.fjsp import FjsFormatError, convert_file, parse_fjs
from p06_ai.schema import Instance
from p06_ai.validation import validate_instance

# 2 job, 3 macchine. J1: O1 su M1(5) o M2(7); O2 su M3(4). J2: O1 su M2(6).
MINI = """2 3 1.3
2 2 1 5 2 7 1 3 4
1 1 2 6
"""


def test_parse_mini():
    inst = parse_fjs(MINI, dataset="test", instance="mini", license="MIT")
    assert [r.id for r in inst.resources] == ["M1", "M2", "M3"]
    assert [j.id for j in inst.jobs] == ["J1", "J2"]
    assert [a.id for a in inst.activities] == ["J1-O1", "J1-O2", "J2-O1"]
    first = inst.activities[0]
    assert [(m.resource_ids, m.duration_min) for m in first.modes] == [(["M1"], 5), (["M2"], 7)]
    assert [(p.from_, p.to) for p in inst.precedences] == [("J1-O1", "J1-O2")]
    assert validate_instance(inst) == []


def test_json_roundtrip_uses_contract_field_names():
    inst = parse_fjs(MINI, dataset="test", instance="mini")
    doc = json.loads(inst.to_json())
    assert doc["precedences"][0] == {"from": "J1-O1", "to": "J1-O2", "type": "FS",
                                     "min_lag_min": 0, "max_lag_min": None}
    assert doc["source"]["dataset"] == "test"
    assert Instance.model_validate(doc) == inst


@pytest.mark.parametrize("text", [
    "",
    "2 3\n1 1 1 5\n",              # manca un job
    "1 2\n1 1 3 5\n",              # macchina fuori intervallo
    "1 2\n2 1 1 5\n",              # dichiarate 2 operazioni, presente 1
    "1 2\n1 1 1 5 9\n",            # valori in eccesso
    "1 2\n1 1 1 x\n",              # non intero
])
def test_malformed_input_is_rejected(text):
    with pytest.raises(FjsFormatError):
        parse_fjs(text, dataset="test", instance="bad")


def _dataset_dir() -> Path:
    default = Path(__file__).resolve().parents[3] / "Dataset" / \
        "Job_Shop_Scheduling_Benchmark_Environments_and_Instances" / "data" / "fjsp"
    return Path(os.environ.get("P06_FJSP_DIR", default))


def test_all_benchmark_files_convert():
    root = _dataset_dir()
    if not root.is_dir():
        pytest.skip(f"dataset non presente in {root}")
    files = [p for p in root.rglob("*") if p.is_file()]
    assert files
    for path in files:
        inst = convert_file(path, dataset=path.parent.name)
        assert validate_instance(inst) == [], path


def test_mk01_dimensions():
    path = _dataset_dir() / "brandimarte" / "Mk01.fjs"
    if not path.is_file():
        pytest.skip("Mk01 non presente")
    inst = convert_file(path, dataset="brandimarte")
    assert (len(inst.jobs), len(inst.resources), len(inst.activities)) == (10, 6, 55)
