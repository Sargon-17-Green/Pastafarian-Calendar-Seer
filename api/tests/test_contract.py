#!/usr/bin/env python3
from __future__ import annotations
import json, math, re, sys
from datetime import datetime
from pathlib import Path

try:
    import yaml
    from jsonschema import Draft202012Validator, FormatChecker
    from referencing import Registry, Resource
except Exception as exc:
    print(f"DEPENDENCY_ERROR: {exc}")
    print("Install: python -m pip install jsonschema PyYAML")
    sys.exit(3)

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "api"
SCHEMAS = API / "schemas"
VALID = API / "examples" / "valid"
INVALID = API / "examples" / "invalid"
RESP_VALID = API / "examples" / "responses" / "valid"
RESP_INVALID = API / "examples" / "responses" / "invalid"
EXPECT = json.loads((Path(__file__).with_name("expectations.json")).read_text(encoding="utf-8"))["invalid"]
SUPPORTED_LOCALES = {"en", "he"}
EXACT_RE = re.compile(r"^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$")
LOCALE_RE = re.compile(r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$")

class ContractError(Exception):
    def __init__(self, code: str, field: str | None = None):
        super().__init__(code)
        self.code = code
        self.field = field


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_locale(value, field="locale"):
    if not isinstance(value, str) or not value or value != value.strip() or not LOCALE_RE.fullmatch(value):
        raise ContractError("INVALID_LOCALE", field)
    parts = value.split("-")
    normalized = [parts[0].lower()]
    for part in parts[1:]:
        if len(part) == 4 and part.isalpha():
            normalized.append(part[0].upper() + part[1:].lower())
        elif len(part) == 2 and part.isalpha():
            normalized.append(part.upper())
        else:
            normalized.append(part.lower())
    return "-".join(normalized)


def validate_locale(value, field="locale"):
    normalized = normalize_locale(value, field)
    if normalized not in SUPPORTED_LOCALES:
        raise ContractError("LOCALE_NOT_SUPPORTED", field)
    return normalized


def schema_registry():
    reg = Registry()
    for p in SCHEMAS.glob("*.schema.json"):
        schema = load_json(p)
        resource = Resource.from_contents(schema)
        if "$id" in schema:
            reg = reg.with_resource(schema["$id"], resource)
        reg = reg.with_resource(p.resolve().as_uri(), resource)
    return reg

REGISTRY = schema_registry()
FORMAT = FormatChecker()


def validate_schema(name: str, instance):
    p = SCHEMAS / f"{name}.schema.json"
    schema = load_json(p)
    v = Draft202012Validator(schema, registry=REGISTRY, format_checker=FORMAT)
    errors = sorted(v.iter_errors(instance), key=lambda e: list(e.absolute_path))
    if errors:
        e = errors[0]
        where = ".".join(str(x) for x in e.absolute_path)
        raise ContractError("SCHEMA_VALIDATION_FAILED", where or None)


def exact(v, field="value") -> int:
    if isinstance(v, bool):
        raise ContractError("INVALID_INTEGER", field)
    if isinstance(v, int):
        if abs(v) > 9007199254740991:
            raise ContractError("INVALID_INTEGER", field)
        return v
    if isinstance(v, str) and EXACT_RE.fullmatch(v):
        return int(v)
    raise ContractError("INVALID_INTEGER", field)


def timestamp(v, field: str):
    if not isinstance(v, str):
        raise ContractError("INVALID_INSTANT", field)
    # Explicit timezone is mandatory. A trailing date component '-' must not count.
    if not (v.endswith("Z") or re.search(r"[+-][0-9]{2}:[0-9]{2}$", v)):
        raise ContractError("INVALID_INSTANT", field)
    try:
        datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        raise ContractError("INVALID_INSTANT", field)


def astronomical_year(era: str, year: int) -> int:
    return year if era == "CE" else 1 - year


def leap(y: int) -> bool:
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


def validate_gregorian(g, field="target.gregorian"):
    if isinstance(g, str):
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", g):
            raise ContractError("INVALID_GREGORIAN_DATE", field)
        y, m, d = map(int, g.split("-"))
        if y == 0:
            raise ContractError("INVALID_GREGORIAN_DATE", field)
        ay = y
    elif isinstance(g, dict):
        if set(g) != {"era", "year", "month", "day"} or g.get("era") not in {"BCE", "CE"}:
            raise ContractError("INVALID_GREGORIAN_DATE", field)
        y = exact(g["year"], field + ".year")
        if y <= 0:
            raise ContractError("INVALID_GREGORIAN_DATE", field + ".year")
        m, d = g.get("month"), g.get("day")
        if not isinstance(m, int) or isinstance(m, bool) or not isinstance(d, int) or isinstance(d, bool):
            raise ContractError("INVALID_GREGORIAN_DATE", field)
        ay = astronomical_year(g["era"], y)
    else:
        raise ContractError("INVALID_GREGORIAN_DATE", field)
    if not 1 <= m <= 12:
        raise ContractError("INVALID_GREGORIAN_DATE", field)
    mdays = [31, 29 if leap(ay) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if not 1 <= d <= mdays[m-1]:
        raise ContractError("INVALID_GREGORIAN_DATE", field)


def include_set(req):
    inc = req.get("include", [])
    return set(inc) if isinstance(inc, list) else set()


def observer_relevant_date(req: dict) -> bool:
    calc = req.get("calculation")
    # Explicit c needs no observer unless requested boundaries need a meridian.
    if isinstance(calc, dict) and set(calc) == {"jdn"} and "boundaries" not in include_set(req):
        return False
    return True


def validate_observer(obs, relevant: bool):
    if not relevant or obs is None:
        return
    if not isinstance(obs, dict):
        raise ContractError("INVALID_OBSERVER", "observer")
    allowed = {"preset", "longitude", "latitude", "elevationMeters"}
    unknown = set(obs) - allowed
    if unknown:
        raise ContractError("UNKNOWN_PARAMETER", "observer." + sorted(unknown)[0])
    selectors = []
    if obs.get("preset") is not None: selectors.append("preset")
    if obs.get("longitude") is not None: selectors.append("longitude")
    if len(selectors) == 0:
        return  # after dropping no-op fields, omitted selector means default Kisurra
    if len(selectors) > 1:
        raise ContractError("AMBIGUOUS_OBSERVER", "observer")
    if selectors[0] == "preset":
        if obs["preset"] != "kisurra":
            raise ContractError("OBSERVER_PRESET_NOT_SUPPORTED", "observer.preset")
    else:
        lon = obs["longitude"]
        if isinstance(lon, bool) or not isinstance(lon, (int, float)) or not math.isfinite(float(lon)) or lon < -180 or lon > 180:
            raise ContractError("INVALID_LONGITUDE", "observer.longitude")


def validate_target(t):
    if t is None:
        return
    if not isinstance(t, dict):
        raise ContractError("INVALID_TARGET", "target")
    allowed = {"jdn", "gregorian", "offsetDays"}
    unknown = set(t) - allowed
    if unknown:
        raise ContractError("UNKNOWN_PARAMETER", "target." + sorted(unknown)[0])
    present = [k for k in allowed if k in t]
    if not present:
        raise ContractError("MISSING_TARGET_SELECTOR", "target")
    if len(present) > 1:
        raise ContractError("AMBIGUOUS_TARGET", "target")
    k = present[0]
    if k == "gregorian": validate_gregorian(t[k])
    else: exact(t[k], "target." + k)


def validate_calculation(c):
    if c is None:
        return
    if not isinstance(c, dict):
        raise ContractError("INVALID_CALCULATION", "calculation")
    allowed = {"jdn", "at"}
    unknown = set(c) - allowed
    if unknown:
        raise ContractError("UNKNOWN_PARAMETER", "calculation." + sorted(unknown)[0])
    present = [k for k in allowed if k in c]
    if not present:
        raise ContractError("MISSING_CALCULATION_SELECTOR", "calculation")
    if len(present) > 1:
        raise ContractError("CONFLICTING_CALCULATION", "calculation")
    if present[0] == "jdn": exact(c["jdn"], "calculation.jdn")
    else: timestamp(c["at"], "calculation.at")


def validate_date(req: dict, schema=True):
    if not isinstance(req, dict): raise ContractError("INVALID_JSON")
    allowed = {"observer","calculation","target","locale","presentation","include"}
    unknown = set(req) - allowed
    if unknown: raise ContractError("UNKNOWN_PARAMETER", sorted(unknown)[0])
    validate_calculation(req.get("calculation"))
    validate_target(req.get("target"))
    validate_observer(req.get("observer"), observer_relevant_date(req))
    presentation = req.get("presentation", "full")
    if presentation not in {"full","canonical"}:
        raise ContractError("UNSUPPORTED_PRESENTATION", "presentation")
    if presentation == "full":
        validate_locale(req.get("locale", "en"))
    inc = req.get("include", [])
    if not isinstance(inc, list) or any(x not in {"structure","boundaries","provenance","resolution"} for x in inc):
        raise ContractError("UNSUPPORTED_INCLUDE", "include")
    if len(inc) != len(set(inc)):
        # Contract normalizes duplicates, so this is valid.
        pass
    if schema:
        validate_schema("date-request", req)


def validate_reverse(req: dict):
    if not isinstance(req, dict): raise ContractError("INVALID_JSON")
    allowed={"observer","calculation","pastafarianDate","locale","presentation","include"}
    unknown=set(req)-allowed
    if unknown: raise ContractError("UNKNOWN_PARAMETER", sorted(unknown)[0])
    if "pastafarianDate" not in req: raise ContractError("MISSING_PASTAFARIAN_DATE","pastafarianDate")
    p=req["pastafarianDate"]
    if not isinstance(p,dict) or set(p)!={"year","cutlet","month"}:
        raise ContractError("MISSING_PASTAFARIAN_DATE","pastafarianDate")
    exact(p["year"],"pastafarianDate.year")
    for name,max_index,max_day in (("cutlet",17,5778),("month",47,123)):
        c=p[name]
        if not isinstance(c,dict) or set(c)!={"canonicalIndex","day"}:
            raise ContractError("MISSING_PASTAFARIAN_DATE",f"pastafarianDate.{name}")
        index=exact(c["canonicalIndex"],f"pastafarianDate.{name}.canonicalIndex")
        day=exact(c["day"],f"pastafarianDate.{name}.day")
        if not 1 <= index <= max_index or not 1 <= day <= max_day:
            raise ContractError("INVALID_PASTAFARIAN_DATE",f"pastafarianDate.{name}")
    validate_calculation(req.get("calculation"))
    relevant=not (isinstance(req.get("calculation"),dict) and set(req["calculation"])=={"jdn"} and "boundaries" not in include_set(req))
    validate_observer(req.get("observer"), relevant)
    presentation=req.get("presentation","full")
    if presentation not in {"full","canonical"}: raise ContractError("UNSUPPORTED_PRESENTATION","presentation")
    if presentation=="full":
        validate_locale(req.get("locale","en"))
    inc=req.get("include",[])
    if not isinstance(inc,list) or any(x not in {"structure","boundaries","provenance","resolution"} for x in inc):
        raise ContractError("UNSUPPORTED_INCLUDE","include")
    validate_schema("reverse-request",req)

def target_to_test_jdn(t):
    if not isinstance(t, dict) or set(t) != {"jdn"}: return None
    return exact(t["jdn"])


def validate_range(req: dict):
    if not isinstance(req, dict): raise ContractError("INVALID_JSON")
    allowed={"observer","calculation","start","count","endInclusive","stepDays","calculationMode","locale","presentation","include"}
    unknown=set(req)-allowed
    if unknown: raise ContractError("UNKNOWN_PARAMETER", sorted(unknown)[0])
    has_count="count" in req; has_end="endInclusive" in req
    if has_count and has_end: raise ContractError("AMBIGUOUS_RANGE_END")
    if not has_count and not has_end: raise ContractError("MISSING_RANGE_END")
    if has_count and exact(req["count"],"count") <= 0: raise ContractError("INVALID_RANGE_COUNT","count")
    step=exact(req.get("stepDays",1),"stepDays")
    if step == 0: raise ContractError("INVALID_RANGE_STEP","stepDays")
    validate_target(req.get("start"))
    if has_end: validate_target(req["endInclusive"])
    mode=req.get("calculationMode","fixed")
    if mode not in {"fixed","same-as-target"}: raise ContractError("INVALID_CALCULATION_MODE","calculationMode")
    validate_calculation(req.get("calculation"))
    # For same-as-target with explicit start, observer/calculation do not affect the dates; schema still permits them.
    relevant_observer = not (mode == "same-as-target" and "start" in req) or "boundaries" in include_set(req)
    validate_observer(req.get("observer"), relevant_observer)
    presentation=req.get("presentation","full")
    if presentation == "full": validate_locale(req.get("locale","en"))
    if has_end:
        a=target_to_test_jdn(req.get("start")); b=target_to_test_jdn(req.get("endInclusive"))
        if a is not None and b is not None and (b-a) % step != 0:
            raise ContractError("UNREACHABLE_RANGE_END","endInclusive")
        if a is not None and b is not None and ((b-a)>0) != (step>0) and b != a:
            raise ContractError("UNREACHABLE_RANGE_END","endInclusive")
    validate_schema("range-request", req)


def validate_batch(req: dict):
    if not isinstance(req, dict): raise ContractError("INVALID_JSON")
    if set(req)-{"defaults","queries"}: raise ContractError("UNKNOWN_PARAMETER")
    qs=req.get("queries")
    if not isinstance(qs,list) or not qs: raise ContractError("INVALID_BATCH")
    ids=[]
    for q in qs:
        if "id" in q: ids.append(q["id"])
        # validate merged semantics except target defaults are disallowed by schema
        merged={k:v for k,v in req.get("defaults",{}).items()}
        merged.update({k:v for k,v in q.items() if k!="id"})
        validate_date(merged, schema=False)
    if len(ids)!=len(set(ids)): raise ContractError("DUPLICATE_BATCH_ID")
    validate_schema("batch-request", req)


def validate_example(path: Path):
    data=load_json(path)
    n=path.name
    if n.startswith("range-"): validate_range(data)
    elif n.startswith("batch-"): validate_batch(data)
    elif n.startswith("reverse-"): validate_reverse(data)
    else: validate_date(data)


def check_all_schema_documents():
    for p in sorted(SCHEMAS.glob("*.schema.json")):
        Draft202012Validator.check_schema(load_json(p))


def check_openapi():
    j=load_json(API/"openapi.json")
    y=yaml.safe_load((API/"openapi.yaml").read_text(encoding="utf-8"))
    if j != y: raise AssertionError("openapi.json and openapi.yaml differ")
    if j.get("openapi") != "3.1.0": raise AssertionError("OpenAPI version is not 3.1.0")
    required={"/v1/now","/v1/date","/v1/batch","/v1/range","/v1/reverse","/v1/year/{year}","/v1/calculation-day","/v1/locales","/v1/meta","/v1/status","/openapi.json","/openapi.yaml"}
    if set(j.get("paths",{})) != required: raise AssertionError("OpenAPI path set mismatch")
    # Every external schema ref in OpenAPI must exist locally.
    text=json.dumps(j)
    for rel in re.findall(r'\.\/schemas\/([A-Za-z0-9.-]+\.schema\.json)', text):
        if not (SCHEMAS/rel).is_file(): raise AssertionError(f"missing schema ref: {rel}")



def check_response_examples():
    mapping = {
        "date-response-full.json": "date-response",
        "date-response-canonical.json": "date-response",
        "error-response.json": "error-response",
        "calculation-day-response.json": "calculation-day-response",
        "locales-response.json": "locales-response",
        "meta-response.json": "meta-response",
        "status-response.json": "status-response",
        "year-response.json": "year-response",
    }
    for name, schema in mapping.items():
        validate_schema(schema, load_json(RESP_VALID / name))
        print("  PASS", name)
    for p in sorted(RESP_INVALID.glob("*.json")):
        try:
            validate_schema("date-response", load_json(p))
        except ContractError:
            print("  PASS", p.name, "=> rejected")
        else:
            raise AssertionError(f"{p.name}: invalid response unexpectedly accepted")

def main():
    print("[1/5] JSON Schema metaschema checks")
    check_all_schema_documents()
    print("[2/5] OpenAPI JSON/YAML consistency and refs")
    check_openapi()
    print("[3/5] Valid examples")
    for p in sorted(VALID.glob("*.json")):
        validate_example(p)
        print("  PASS",p.name)
    print("[4/5] Invalid examples and expected semantic codes")
    for p in sorted(INVALID.glob("*.json")):
        expected=EXPECT[p.name]
        try:
            validate_example(p)
        except ContractError as e:
            if e.code != expected:
                raise AssertionError(f"{p.name}: expected {expected}, got {e.code}") from e
            print("  PASS",p.name,"=>",e.code)
        else:
            raise AssertionError(f"{p.name}: unexpectedly valid; expected {expected}")
    print("[5/5] Response examples")
    check_response_examples()
    print("CONTRACT_TESTS_PASS")

if __name__ == "__main__":
    main()
