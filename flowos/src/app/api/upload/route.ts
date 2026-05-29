import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { uploadToStorage } from "@/lib/supabase-storage";

export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bucket = (formData.get("bucket") as string) || "org-files";
    const name = formData.get("name") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const ext = file.name.split(".").pop() ?? "";
    const path = name
      ? `${orgId}/${name}${ext ? `.${ext}` : ""}`
      : `${orgId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const url = await uploadToStorage(bucket, path, buffer, file.type || "application/octet-stream");

    return NextResponse.json({ url });
  } catch (err) {
    return apiError(err);
  }
}
