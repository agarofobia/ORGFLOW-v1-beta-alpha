"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Share2, Trash2, Users, Building2, Layers } from "lucide-react";

interface AccessGrant {
  id: string;
  granteeType: "user" | "employee" | "department" | "division";
  granteeId: string;
  grantedAt: string;
}

interface Employee { id: string; fullName: string; jobTitle: string | null; }
interface Department { id: string; name: string; }
interface Division { id: string; name: string; }

const GRANTEE_ICONS = {
  user: <Users className="h-3.5 w-3.5" />,
  employee: <Users className="h-3.5 w-3.5" />,
  department: <Building2 className="h-3.5 w-3.5" />,
  division: <Layers className="h-3.5 w-3.5" />,
};

const GRANTEE_LABELS = {
  user: "Usuario",
  employee: "Empleado",
  department: "Departamento",
  division: "División",
};

export default function ShareModal({
  documentId,
  documentTitle,
  onClose,
}: {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}) {
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);

  const [granteeType, setGranteeType] = useState<"employee" | "department" | "division">("employee");
  const [granteeId, setGranteeId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, eRes, dRes, divRes] = await Promise.all([
        fetch(`/api/documents/${documentId}/access`),
        fetch("/api/employees"),
        fetch("/api/departments"),
        fetch("/api/divisions"),
      ]);
      if (gRes.ok) setGrants(await gRes.json());
      if (eRes.ok) setEmployees(await eRes.json());
      if (dRes.ok) setDepartments(await dRes.json());
      if (divRes.ok) setDivisions(await divRes.json());
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addGrant = async () => {
    if (!granteeId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granteeType, granteeId }),
      });
      if (res.ok) {
        await loadAll();
        setGranteeId("");
      }
    } finally {
      setSaving(false);
    }
  };

  const revokeGrant = async (accessId: string) => {
    await fetch(`/api/documents/${documentId}/access`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessId }),
    });
    setGrants((g) => g.filter((x) => x.id !== accessId));
  };

  const getGranteeName = (grant: AccessGrant): string => {
    if (grant.granteeType === "employee") {
      return employees.find((e) => e.id === grant.granteeId)?.fullName ?? grant.granteeId;
    }
    if (grant.granteeType === "department") {
      return departments.find((d) => d.id === grant.granteeId)?.name ?? grant.granteeId;
    }
    if (grant.granteeType === "division") {
      return divisions.find((d) => d.id === grant.granteeId)?.name ?? grant.granteeId;
    }
    return grant.granteeId;
  };

  const options =
    granteeType === "employee"
      ? employees.map((e) => ({ id: e.id, label: `${e.fullName}${e.jobTitle ? ` — ${e.jobTitle}` : ""}` }))
      : granteeType === "department"
      ? departments.map((d) => ({ id: d.id, label: d.name }))
      : divisions.map((d) => ({ id: d.id, label: d.name }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6"
        style={{ background: "#0E1220", border: "1px solid #1E2540" }}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4" style={{ color: "#3D7EFF" }} />
            <span className="font-semibold text-sm" style={{ color: "#E2E8F8" }}>Compartir documento</span>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[#1E2540]" style={{ color: "#7A8BAD" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-5 text-xs truncate" style={{ color: "#7A8BAD" }}>{documentTitle}</p>

        {/* Grant form */}
        <div className="mb-5 flex flex-col gap-2">
          <div className="flex gap-2">
            {(["employee", "department", "division"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setGranteeType(t); setGranteeId(""); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-all"
                style={
                  granteeType === t
                    ? { background: "rgba(61,126,255,0.15)", border: "1px solid rgba(61,126,255,0.4)", color: "#7AABFF" }
                    : { background: "#141928", border: "1px solid #1E2540", color: "#7A8BAD" }
                }
              >
                {GRANTEE_ICONS[t]}
                {t === "employee" ? "Empleado" : t === "department" ? "Depto" : "División"}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <select
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              className="flex-1 rounded px-3 py-2 text-sm outline-none"
              style={{ background: "#141928", border: "1px solid #1E2540", color: granteeId ? "#E2E8F8" : "#7A8BAD" }}
            >
              <option value="">Seleccionar…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={addGrant}
              disabled={!granteeId || saving}
              className="rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              style={{ background: "#3D7EFF" }}
            >
              {saving ? "…" : "Dar acceso"}
            </button>
          </div>
        </div>

        {/* Current grants */}
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7A8BAD" }}>
            Accesos activos ({grants.length})
          </p>
          {loading ? (
            <p className="py-4 text-center text-xs" style={{ color: "#7A8BAD" }}>Cargando…</p>
          ) : grants.length === 0 ? (
            <p className="py-4 text-center text-xs" style={{ color: "#4A5568" }}>
              Sin accesos específicos — solo admins pueden verlo.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {grants.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-2 rounded px-3 py-2"
                  style={{ background: "#141928", border: "1px solid #1E2540" }}
                >
                  <span style={{ color: "#7A8BAD" }}>{GRANTEE_ICONS[g.granteeType]}</span>
                  <span className="flex-1 text-xs" style={{ color: "#C4CFEA" }}>{getGranteeName(g)}</span>
                  <span className="font-mono text-[9px]" style={{ color: "#4A5568" }}>{GRANTEE_LABELS[g.granteeType]}</span>
                  <button
                    onClick={() => revokeGrant(g.id)}
                    className="rounded p-1 hover:bg-red-500/10"
                    style={{ color: "#7A8BAD" }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
