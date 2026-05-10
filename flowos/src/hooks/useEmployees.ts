import useSWR from "swr";
import { Employee } from "@/db/schema";

// Referencia estable para array vacío — evita el loop infinito de useEffect([employees])
const EMPTY: Employee[] = [];

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error ?? `HTTP ${r.status}`);
  }
  return r.json();
};

export function useEmployees() {
  const { data, error, isLoading, mutate } = useSWR<Employee[]>(
    "/api/employees",
    fetcher
  );

  const addEmployee = async (data: {
    fullName: string;
    jobTitle: string;
    color: string;
    positionX?: number;
    positionY?: number;
  }) => {
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const newEmp = await res.json();
    mutate((prev) => [...(prev || []), newEmp], false);
    return newEmp;
  };

  const updateEmployee = async (
    id: string,
    updates: Partial<Employee>
  ) => {
    const res = await fetch(`/api/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    mutate((prev) =>
      prev?.map((e) => (e.id === id ? updated : e)),
      false
    );
    return updated;
  };

  const deleteEmployee = async (id: string) => {
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    mutate((prev) => prev?.filter((e) => e.id !== id), false);
  };

  return {
    employees: Array.isArray(data) ? data : EMPTY,
    isLoading,
    error,
    addEmployee,
    updateEmployee,
    deleteEmployee,
  };
}
