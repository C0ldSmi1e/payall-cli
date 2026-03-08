import { getConfig } from "../utils/config.js";
import { getToken } from "../auth/store.js";

interface StandardResponse {
  code: number;
  data: unknown;
  message: string;
  status: string;
}

interface PathResponse {
  resCode: string;
  resMsg: string;
  data: unknown;
}

export class ApiError extends Error {
  code: number | string;
  constructor(code: number | string, message: string) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}

type ApiResult<T = unknown> = { data: T };

async function request<T = unknown>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    body?: Record<string, unknown>;
    auth?: boolean;
    pathStyle?: boolean;
  } = {}
): Promise<ApiResult<T>> {
  const { method = "POST", body, auth = true, pathStyle = false } = options;
  const config = getConfig();
  const url = `${config.api_url}/${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken();
    if (!token) {
      throw new ApiError(4001, "Not logged in. Run: payall auth login");
    }
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = { method, headers };
  if (body && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    throw new ApiError(0, `Network error: ${(err as Error).message}`);
  }

  const json = await res.json();

  if (pathStyle) {
    const resp = json as PathResponse;
    if (resp.resCode !== "100" && resp.resCode !== 100 as unknown as string) {
      throw new ApiError(resp.resCode, resp.resMsg || "Request failed");
    }
    return { data: resp.data as T };
  }

  const resp = json as StandardResponse;
  if (resp.code !== 200) {
    throw new ApiError(resp.code, resp.message || "Request failed");
  }
  return { data: resp.data as T };
}

// Standard envelope endpoints (code/data/message)
export function api<T = unknown>(
  endpoint: string,
  options?: {
    method?: "GET" | "POST" | "PUT";
    body?: Record<string, unknown>;
    auth?: boolean;
  }
): Promise<ApiResult<T>> {
  return request<T>(endpoint, { ...options, pathStyle: false });
}

// Path-style envelope endpoints (resCode/resMsg/data)
export function pathApi<T = unknown>(
  endpoint: string,
  options?: {
    method?: "GET" | "POST" | "PUT";
    body?: Record<string, unknown>;
    auth?: boolean;
  }
): Promise<ApiResult<T>> {
  return request<T>(endpoint, { ...options, pathStyle: true });
}
