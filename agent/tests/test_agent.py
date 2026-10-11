"""Pruebas del agente sin hardware: un Hikvision simulado (ISAPI), un ZKTeco
por TCP simulado y una nube simulada que se cae y vuelve."""
import base64
import json
from datetime import date, datetime, timedelta

import httpx
from lsmfit_agent.cloud import Cloud
from lsmfit_agent.config import AgentConfig, DeviceConfig
from lsmfit_agent.drivers.hikvision import HikvisionDriver
from lsmfit_agent.drivers.zk_tcp import ZkTcpDriver
from lsmfit_agent.main import Agent
from lsmfit_agent.store import Store

JPEG = b"\xff\xd8\xff\xe0fakejpeg\xff\xd9"


class FakeHik:
    """Responde como un MinMoe: usuarios, rostros y eventos."""

    def __init__(self):
        self.users: dict[str, dict] = {}
        self.faces: set[str] = set()
        self.calls: list[tuple[str, str]] = []
        self.events: list[dict] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append((request.method, path))
        if path == "/ISAPI/AccessControl/UserInfo/SetUp":
            info = json.loads(request.content)["UserInfo"]
            self.users[info["employeeNo"]] = info
            return httpx.Response(200, json={"statusCode": 1, "statusString": "OK"})
        if path == "/ISAPI/Intelligent/FDLib/FaceDataRecord":
            body = request.content
            assert b'name="FaceDataRecord"' in body and JPEG in body
            fpid = json.loads(body.split(b"\r\n\r\n", 1)[1].split(b"\r\n", 1)[0])["FPID"]
            self.faces.add(fpid)
            return httpx.Response(200, json={"statusCode": 1})
        if path == "/ISAPI/AccessControl/CaptureFaceData":
            return httpx.Response(200, content=b"--boundary\r\nContent-Type: image/jpeg\r\n\r\n" + JPEG + b"\r\n--boundary--")
        if path == "/ISAPI/AccessControl/UserInfo/Search":
            pos = json.loads(request.content)["UserInfoSearchCond"]["searchResultPosition"]
            items = [{"employeeNo": k, "name": v.get("name"), "numOfFace": int(k in self.faces), "numOfFP": 0}
                     for k, v in sorted(self.users.items())]
            page = items[pos:pos + 1]
            return httpx.Response(200, json={"UserInfoSearch": {
                "UserInfo": page, "responseStatusStrg": "MORE" if pos + 1 < len(items) else "OK"}})
        if path == "/ISAPI/AccessControl/AcsEvent":
            return httpx.Response(200, json={"AcsEvent": {"InfoList": self.events, "responseStatusStrg": "OK"}})
        if path.startswith("/ISAPI/AccessControl/RemoteControl/door/"):
            return httpx.Response(200, text="<ResponseStatus><statusCode>1</statusCode></ResponseStatus>")
        return httpx.Response(404, json={"statusCode": 4, "subStatusCode": "notSupport"})


def _hik(fake):
    return HikvisionDriver(DeviceConfig(driver="hikvision", host="10.0.0.5"), transport=httpx.MockTransport(fake))


async def test_hikvision_user_validity_blocks_without_deleting():
    fake = FakeHik()
    drv = _hik(fake)
    until = (date.today() + timedelta(days=30)).isoformat()
    await drv.execute("user_sync", {"pin": "1018", "name": "Ana", "enabled": True, "valid_until": until}, {})
    assert fake.users["1018"]["Valid"]["endTime"] == f"{until}T23:59:59"
    await drv.execute("user_sync", {"pin": "1018", "name": "Ana", "enabled": False}, {})
    end = fake.users["1018"]["Valid"]["endTime"]
    assert end < datetime.now().strftime("%Y-%m-%dT%H:%M:%S"), "bloqueado = vigencia vencida"
    assert not any(p.endswith("UserInfo/Delete") for _, p in fake.calls)


async def test_hikvision_face_from_photo_and_capture():
    fake = FakeHik()
    drv = _hik(fake)
    r = await drv.execute("face_photo", {"pin": "1018", "content_b64": base64.b64encode(JPEG).decode()}, {})
    assert r == {"face": True} and "1018" in fake.faces
    r = await drv.execute("enroll_face", {"pin": "2020"}, {})
    assert r == {"face": True} and "2020" in fake.faces


async def test_hikvision_roster_paginates_and_events_classify():
    fake = FakeHik()
    drv = _hik(fake)
    for pin in ("1", "2", "3"):
        fake.users[pin] = {"name": f"U{pin}"}
    users = await drv.list_users()
    assert [u["pin"] for u in users] == ["1", "2", "3"]

    fake.events = [
        {"major": 5, "minor": 75, "employeeNoString": "1", "time": "2026-10-08T17:19:00-05:00", "serialNo": 10},
        {"major": 5, "minor": 76, "employeeNoString": "2", "time": "2026-10-08T17:20:00-05:00", "serialNo": 11},
        {"major": 5, "minor": 22, "time": "2026-10-08T17:21:00-05:00"},
    ]
    events, cursor = await drv.events_since(datetime(2026, 10, 8, 17, 0))
    assert [(e["device_user_id"], e["allowed"], e["credential_kind"]) for e in events] == [
        ("1", True, "face"), ("2", False, "face")]
    assert cursor > datetime(2026, 10, 8, 17, 20)


class FakeCloud:
    def __init__(self):
        self.down = False
        self.commands = [{"id": "c1", "kind": "open_door", "payload": {"pin": ""}, "config": {}}]
        self.results: list[dict] = []
        self.punches: list[dict] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("sin internet")
        path = request.url.path
        if path == "/api/v1/access/agent/commands":
            cmds, self.commands = self.commands, []
            return httpx.Response(200, json=cmds)
        if path.endswith("/result"):
            self.results.append(json.loads(request.content))
            return httpx.Response(200, json={"status": "done"})
        if path == "/api/v1/access/agent/punches":
            self.punches.extend(json.loads(request.content)["events"])
            return httpx.Response(200, json={"checkin": 1})
        return httpx.Response(200, json={})


async def test_agent_executes_commands_and_buffers_punches_offline(tmp_path):
    hik, cloud_fake = FakeHik(), FakeCloud()
    cfg = AgentConfig(cloud_url="http://cloud", device_token="t", device=DeviceConfig(driver="hikvision", host="x"),
                      data_dir=str(tmp_path))
    agent = Agent(cfg, Cloud("http://cloud", "t", transport=httpx.MockTransport(cloud_fake)), _hik(hik), Store(tmp_path))

    assert await agent.run_commands_once() == 1
    assert cloud_fake.results == [{"ok": True, "error": None, "result": None}]

    hik.events = [{"major": 5, "minor": 38, "employeeNoString": "7", "time": datetime.now().isoformat(timespec="seconds")}]
    cloud_fake.down = True
    assert await agent.read_events_once() == 0
    assert agent.online is False and len(agent.store.pending_punches()) == 1

    cloud_fake.down = False
    hik.events = []
    assert await agent.flush_punches() == 1
    assert cloud_fake.punches[0]["device_user_id"] == "7" and agent.store.pending_punches() == []


class FakeZkConn:
    """Imita la conexión de pyzk."""

    def __init__(self, state):
        self.s = state

    def get_users(self):
        from zk.user import User
        return [User(uid, name, 0, "", "", pin) for pin, (uid, name) in self.s["users"].items()]

    def get_templates(self):
        from zk.finger import Finger
        return [Finger(uid, fid, 1, tpl) for (uid, fid), tpl in self.s["templates"].items()]

    def set_user(self, uid=None, name="", privilege=0, password="", group_id="", user_id="", card=0):
        self.s["users"][user_id] = (uid, name)

    def delete_user(self, uid=0, user_id=""):
        self.s["users"] = {p: v for p, v in self.s["users"].items() if v[0] != uid}
        self.s["templates"] = {k: v for k, v in self.s["templates"].items() if k[0] != uid}

    def save_user_template(self, user, fingers=[]):
        for f in fingers:
            self.s["templates"][(user.uid, f.fid)] = f.template

    def disconnect(self):
        pass


async def test_zk_tcp_block_keeps_fingerprints_on_premise_and_restores(tmp_path):
    state = {"users": {"1018": (1, "ANA")}, "templates": {(1, 0): b"huella-binaria"}}
    store = Store(tmp_path)
    drv = ZkTcpDriver(DeviceConfig(driver="zk_tcp", host="x"), store, zk_factory=lambda: FakeZkConn(state))

    r = await drv.execute("user_sync", {"pin": "1018", "name": "Ana", "enabled": False}, {})
    assert r == {"removed": True, "kept_fingers": 1} and "1018" not in state["users"]

    r = await drv.execute("user_sync", {"pin": "1018", "name": "Ana", "enabled": True}, {})
    assert r["restored_fingers"] == 1
    uid = state["users"]["1018"][0]
    assert state["templates"][(uid, 0)] == b"huella-binaria"
    assert store.pop_templates("1018") is None, "tras restaurar no queda copia en el PC"


def test_config_loads_example(tmp_path):
    raw = json.loads(open("lsmfit-agent.example.json", encoding="utf-8").read())
    p = tmp_path / "c.json"
    p.write_text(json.dumps(raw))
    cfg = AgentConfig.load(p)
    assert cfg.device.driver == "hikvision" and cfg.poll_seconds == 3

