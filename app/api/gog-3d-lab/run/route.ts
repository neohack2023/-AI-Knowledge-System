import { NextResponse } from "next/server";

const PROVIDERS = {
  "sam3d-mhr": {
    label: "SAM 3D Body + MHR",
    env: "GOG_SAM3D_BODY_ENDPOINT",
    tokenEnv: "GOG_SAM3D_BODY_TOKEN",
  },
} as const;

type ProviderId = keyof typeof PROVIDERS;

function providerStatus(id: ProviderId) {
  const def = PROVIDERS[id];
  const endpoint = process.env[def.env]?.trim();
  return {
    id,
    label: def.label,
    available: Boolean(endpoint),
    endpointConfigured: Boolean(endpoint),
  };
}

export async function GET() {
  return NextResponse.json({
    providers: Object.keys(PROVIDERS).map((id) => providerStatus(id as ProviderId)),
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const provider = String(form.get("provider") ?? "") as ProviderId;
  const image = form.get("image");

  if (!(provider in PROVIDERS)) {
    return NextResponse.json({ error: "UNKNOWN_PROVIDER" }, { status: 400 });
  }
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "IMAGE_REQUIRED" }, { status: 400 });
  }
  if (!image.type.startsWith("image/")) {
    return NextResponse.json({ error: "IMAGE_TYPE_UNSUPPORTED" }, { status: 415 });
  }
  if (image.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "IMAGE_TOO_LARGE", maxBytes: 20 * 1024 * 1024 }, { status: 413 });
  }

  const def = PROVIDERS[provider];
  const endpoint = process.env[def.env]?.trim();
  if (!endpoint) {
    return NextResponse.json(
      {
        error: "PROVIDER_NOT_CONFIGURED",
        provider,
        requiredEnvironment: def.env,
      },
      { status: 503 },
    );
  }

  const forwarded = new FormData();
  forwarded.set("image", image, image.name || "reference.png");
  const useMask = String(form.get("useMask") ?? "true");
  forwarded.set("use_mask", useMask);
  const bboxThreshold = String(form.get("bboxThreshold") ?? "0.8");
  forwarded.set("bbox_threshold", bboxThreshold);

  const headers: HeadersInit = {};
  const token = process.env[def.tokenEnv]?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const started = Date.now();
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/reconstruct`, {
      method: "POST",
      headers,
      body: forwarded,
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "PROVIDER_FAILED",
          provider,
          providerStatus: response.status,
          detail: text.slice(0, 1200),
        },
        { status: 502 },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "PROVIDER_INVALID_JSON", provider }, { status: 502 });
    }

    const result = payload as Record<string, unknown>;
    if (typeof result.mesh_obj !== "string") {
      return NextResponse.json(
        { error: "PROVIDER_SCHEMA_MISMATCH", provider, expected: "mesh_obj:string" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      provider,
      elapsedMs: Date.now() - started,
      meshObj: result.mesh_obj,
      metrics: result.metrics ?? null,
      model: result.model ?? null,
      camera: result.camera ?? null,
      warnings: result.warnings ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "PROVIDER_UNREACHABLE",
        provider,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
