import json
import os
from pathlib import Path

import pytest

from p06_ai.converters._common import convert_tree, load_jsplib_metadata
from p06_ai.converters.jsp import JspFormatError, convert_file, parse_jsp
from p06_ai.validation import validate_instance

# 2 job, 3 macchine, con commenti in stile JSPLIB.
MINI = """# instance mini
#++++
2 3
0 5  2 4  1 7
1 6  0 3  2 2
"""


def test_parse_mini():
    inst = parse_jsp(MINI, dataset="test", instance="mini")
    assert [r.id for r in inst.resources] == ["M1", "M2", "M3"]
    assert [a.id for a in inst.activities] == ["J1-O1", "J1-O2", "J1-O3",
                                               "J2-O1", "J2-O2", "J2-O3"]
    # La macchina 0 del file è M1, la 2 è M3.
    assert [(a.modes[0].resource_ids[0], a.modes[0].duration_min)
            for a in inst.activities[:3]] == [("M1", 5), ("M3", 4), ("M2", 7)]
    assert all(len(a.modes) == 1 for a in inst.activities)
    assert [(p.from_, p.to) for p in inst.precedences] == [
        ("J1-O1", "J1-O2"), ("J1-O2", "J1-O3"), ("J2-O1", "J2-O2"), ("J2-O2", "J2-O3")]
    assert validate_instance(inst) == []


@pytest.mark.parametrize("text", [
    "",
    "# solo commenti\n",
    "2 2\n0 5 1 3\n",          # manca un job
    "1 2\n0 5 2 3\n",          # macchina fuori intervallo
    "1 2\n0 5 1\n",            # numero dispari di valori
    "1 2\n0 x\n",              # non intero
    "1 2 3\n0 5\n",            # intestazione con tre valori
])
def test_malformed_input_is_rejected(text):
    with pytest.raises(JspFormatError):
        parse_jsp(text, dataset="test", instance="bad")


def test_convert_tree_writes_best_known(tmp_path):
    src = tmp_path / "in" / "mini"
    src.parent.mkdir()
    src.write_text(MINI, encoding="utf-8")
    other = tmp_path / "in" / "other"
    other.write_text(MINI, encoding="utf-8")
    meta = tmp_path / "instances.json"
    meta.write_text(json.dumps([
        {"name": "mini", "jobs": 2, "machines": 3, "optimum": 18, "path": "x"},
        {"name": "other", "jobs": 2, "machines": 3, "optimum": None,
         "bounds": {"upper": 20, "lower": 17}, "path": "y"},
    ]), encoding="utf-8")

    written, errors = convert_tree(tmp_path / "in", tmp_path / "out", parse_jsp,
                                   dataset="JSPLIB",
                                   best_known=load_jsplib_metadata(meta))
    assert (written, errors) == (2, [])
    mini = json.loads((tmp_path / "out" / "JSPLIB" / "mini.json").read_text("utf-8"))
    assert mini["source"]["best_known"] == {"makespan": 18, "lower_bound": 18, "optimal": True}
    oth = json.loads((tmp_path / "out" / "JSPLIB" / "other.json").read_text("utf-8"))
    assert oth["source"]["best_known"] == {"makespan": 20, "lower_bound": 17, "optimal": False}


def test_convert_tree_reports_bad_files(tmp_path):
    (tmp_path / "in").mkdir()
    (tmp_path / "in" / "bad").write_text("1 2\n0 5 1\n", encoding="utf-8")
    written, errors = convert_tree(tmp_path / "in", tmp_path / "out", parse_jsp)
    assert written == 0 and len(errors) == 1
    assert not (tmp_path / "out").exists()


def _dataset_root() -> Path:
    default = Path(__file__).resolve().parents[4] / "Dataset"
    return Path(os.environ.get("P06_DATASET_DIR", default))


def test_all_jsplib_instances_match_metadata():
    root = _dataset_root() / "JSPLIB"
    if not root.is_dir():
        pytest.skip(f"JSPLIB non presente in {root}")
    meta = json.loads((root / "instances.json").read_text(encoding="utf-8"))
    assert len(meta) == 162
    for entry in meta:
        inst = convert_file(root / entry["path"], dataset="JSPLIB")
        assert validate_instance(inst) == [], entry["name"]
        assert len(inst.jobs) == entry["jobs"], entry["name"]
        assert len(inst.resources) == entry["machines"], entry["name"]
        assert len(inst.activities) == entry["jobs"] * entry["machines"], entry["name"]


def test_all_tue_jsp_files_convert():
    root = _dataset_root() / "Job_Shop_Scheduling_Benchmark_Environments_and_Instances" \
        / "data" / "jsp"
    if not root.is_dir():
        pytest.skip(f"dataset non presente in {root}")
    files = [p for p in root.rglob("*") if p.is_file() and not p.name.startswith(".")]
    assert files
    for path in files:
        inst = convert_file(path, dataset=path.parent.name)
        assert validate_instance(inst) == [], path
