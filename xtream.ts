export type ContentKind = "live" | "vod" | "series";
export type ContentSource = "api" | "m3u";

export type XtreamCredentials = {
  server: string;
  username: string;
  password: string;
  source?: ContentSource;
};

export type XtreamCategory = {
  id: string;
  name: string;
};

export type PlayableItem = {
  id: string;
  title: string;
  image: string;
  description: string;
  kind: ContentKind;
  extension: string;
  duration?: number;
  production?: string;
  season?: string;
  episode?: string;
  seriesId?: string;
  seriesKey?: string;
  streamUrl?: string;
  fallbackStreamUrl?: string;
  group?: string;
  categoryId?: string;
  credentials: XtreamCredentials;
};

type XtreamRequest = Record<string, string>;
const playlistCache = new Map<string, PlayableItem[]>();
const playlistInFlight = new Map<string, Promise<PlayableItem[]>>();

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function cacheKey(credentials: XtreamCredentials): string {
  return `${credentials.server}|${credentials.username}`;
}

function queryValue(url: string, name: string): string {
  const parsed = new URL(url);
  return parsed.searchParams.get(name) ?? "";
}

export function prepareCredentials(
  serverInput: string,
  usernameInput: string,
  passwordInput: string,
): XtreamCredentials {
  const input = serverInput.trim();
  let suppliedUsername = usernameInput.trim();
  let suppliedPassword = passwordInput;

  try {
    if (input.includes("?")) {
      suppliedUsername ||= queryValue(input, "username");
      suppliedPassword ||= queryValue(input, "password");
    }
  } catch {
    // A validação de URL abaixo apresentará uma mensagem apropriada ao usuário.
  }

  const withoutQuery = input.split("?")[0] ?? input;
  const withoutEndpoint = withoutQuery
    .replace(/\/(player_api|panel_api|get)\.php$/i, "")
    .replace(/\/+$/, "");
  const server = /^https?:\/\//i.test(withoutEndpoint)
    ? withoutEndpoint
    : `http://${withoutEndpoint}`;

  return { server, username: suppliedUsername, password: suppliedPassword };
}

function buildApiUrl(
  credentials: XtreamCredentials,
  action?: string,
  extra: XtreamRequest = {},
): string {
  const url = new URL(`${credentials.server}/player_api.php`);
  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  if (action) url.searchParams.set("action", action);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
}

function buildM3uUrl(credentials: XtreamCredentials): string {
  const url = new URL(`${credentials.server}/get.php`);
  url.searchParams.set("username", credentials.username);
  url.searchParams.set("password", credentials.password);
  url.searchParams.set("type", "m3u_plus");
  url.searchParams.set("output", "ts");
  return url.toString();
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Falha desconhecida ao acessar o servidor.";
}

async function request(url: string, accept: string, timeout = 20_000): Promise<Response> {
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: accept },
      signal: aborter.signal,
    });
    if (!response.ok) throw new Error(`O servidor respondeu com erro ${response.status}.`);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("O servidor demorou para responder. Verifique sua conexão e tente novamente.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function xtreamFetch<T>(url: string): Promise<T> {
  const response = await request(url, "application/json, text/plain;q=0.8, */*;q=0.5");
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("O provedor não disponibiliza uma API Xtream JSON neste endereço.");
  }
}

function attribute(line: string, name: string): string {
  const match = line.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1]?.trim() ?? "";
}

function streamKind(title: string, group: string, url: string): ContentKind {
  const hint = `${title} ${group} ${url}`.toLocaleLowerCase();
  if (/\/(movie|vod)\//.test(hint) || /\b(filmes?|movies?|cinema|vod)\b/.test(hint)) return "vod";
  if (/\/(series|serie)\//.test(hint) || /\b(s[eé]ries?|seriados?|shows?)\b/.test(hint)) return "series";
  return "live";
}

function episodeParts(title: string): { seriesKey: string; season?: string; episode?: string } {
  const match = title.match(/(?:\bS(\d{1,2})\s*E(\d{1,3})\b|\bT(\d{1,2})\s*E(\d{1,3})\b|\b(\d{1,2})x(\d{1,3})\b)/i);
  const season = match?.[1] ?? match?.[3] ?? match?.[5];
  const episode = match?.[2] ?? match?.[4] ?? match?.[6];
  const seriesKey = match
    ? title.slice(0, Math.max(0, match.index ?? 0)).replace(/[\s\-–|:]+$/, "").trim()
    : title.trim();
  return { seriesKey: seriesKey || title.trim(), season, episode };
}

export function parseM3uPlaylist(text: string, credentials: XtreamCredentials): PlayableItem[] {
  const lines = text.split(/\r?\n/);
  const entries: PlayableItem[] = [];
  let metadata = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      metadata = line;
      continue;
    }
    if (line.startsWith("#") || !metadata) continue;

    const title = metadata.split(",").slice(1).join(",").trim() || "Sem título";
    const group = attribute(metadata, "group-title") || "Sem categoria";
    const image = attribute(metadata, "tvg-logo");
    const path = line.split("?")[0] ?? line;
    const lastSegment = path.split("/").pop() ?? "";
    const extension = lastSegment.includes(".") ? lastSegment.split(".").pop() ?? "ts" : "ts";
    const id = `${lastSegment.replace(/\.[^.]+$/, "") || entries.length}-${entries.length}`;
    const kind = streamKind(title, group, line);
    const episode = episodeParts(title);

    entries.push({
      id,
      title,
      image,
      description: group,
      kind,
      extension,
      season: kind === "series" ? episode.season : undefined,
      episode: kind === "series" ? episode.episode : undefined,
      seriesKey: kind === "series" ? episode.seriesKey : undefined,
      streamUrl: line,
      group,
      categoryId: group,
      credentials,
    });
    metadata = "";
  }
  return entries;
}

async function loadM3u(credentials: XtreamCredentials, refresh = false): Promise<PlayableItem[]> {
  const key = cacheKey(credentials);
  const cached = playlistCache.get(key);
  if (cached && !refresh) return cached;
  const running = playlistInFlight.get(key);
  if (running) return running;

  const requestPromise = (async () => {
    const response = await request(buildM3uUrl(credentials), "application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*", 300_000);
    const body = await response.text();
    if (!body.includes("#EXTM3U")) {
      throw new Error("O provedor respondeu, mas não retornou uma lista M3U válida.");
    }
    const items = parseM3uPlaylist(body, { ...credentials, source: "m3u" });
    if (!items.length) throw new Error("A lista M3U foi aceita, mas não contém canais ou conteúdos disponíveis.");
    playlistCache.set(key, items);
    return items;
  })();
  playlistInFlight.set(key, requestPromise);
  try {
    return await requestPromise;
  } finally {
    playlistInFlight.delete(key);
  }
}

export async function validateAccount(credentials: XtreamCredentials): Promise<XtreamCredentials> {
  if (!credentials.server || !credentials.username || !credentials.password) {
    throw new Error("Informe servidor, usuário e senha.");
  }

  try {
    const result = await xtreamFetch<Record<string, unknown>>(buildApiUrl(credentials));
    const account = result.user_info as Record<string, unknown> | undefined;
    if (account) {
      const status = stringValue(account.status).toLowerCase();
      if (status && status !== "active") throw new Error("A conta não está ativa. Confira usuário, senha ou validade.");
      return { ...credentials, source: "api" };
    }
  } catch {
    // Alguns provedores entregam apenas get.php/M3U; o fallback abaixo atende esse formato.
  }

  try {
    await loadM3u(credentials, true);
    return { ...credentials, source: "m3u" };
  } catch (m3uError) {
    throw new Error(`Não foi possível validar a lista. ${errorText(m3uError)}`);
  }
}

const categoryAction: Record<ContentKind, string> = {
  live: "get_live_categories",
  vod: "get_vod_categories",
  series: "get_series_categories",
};

const streamAction: Record<ContentKind, string> = {
  live: "get_live_streams",
  vod: "get_vod_streams",
  series: "get_series",
};

export async function getCategories(
  credentials: XtreamCredentials,
  kind: ContentKind,
): Promise<XtreamCategory[]> {
  if (credentials.source === "m3u") {
    const seen = new Set<string>();
    return (await loadM3u(credentials))
      .filter((item) => item.kind === kind)
      .map((item) => ({ id: item.group || "Sem categoria", name: item.group || "Sem categoria" }))
      .filter((category) => !seen.has(category.id) && Boolean(seen.add(category.id)));
  }

  const response = await xtreamFetch<unknown>(buildApiUrl(credentials, categoryAction[kind]));
  if (!Array.isArray(response)) return [];
  return response
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        id: stringValue(item.category_id),
        name: stringValue(item.category_name) || "Sem nome",
      };
    })
    .filter((item) => item.id || item.name);
}

function normalizeExtension(value: string): string {
  return value.trim().replace(/^\./, "").toLocaleLowerCase() || "mp4";
}

function cleanStreamUrl(value: string): string {
  return value.trim().split("|")[0]?.trim() ?? "";
}

function canonicalStreamUrl(item: PlayableItem): string {
  const base = item.credentials.server;
  const user = encodeURIComponent(item.credentials.username);
  const pass = encodeURIComponent(item.credentials.password);
  if (item.kind === "live") return `${base}/live/${user}/${pass}/${item.id}.m3u8`;
  if (item.kind === "vod") return `${base}/movie/${user}/${pass}/${item.id}.${normalizeExtension(item.extension)}`;
  return `${base}/series/${user}/${pass}/${item.id}.${normalizeExtension(item.extension)}`;
}

function streamUrl(item: PlayableItem, useFallback = false): string {
  if (useFallback && item.fallbackStreamUrl) return cleanStreamUrl(item.fallbackStreamUrl);
  if (item.streamUrl) return cleanStreamUrl(item.streamUrl);
  return canonicalStreamUrl(item);
}

export function playbackUrl(item: PlayableItem): string {
  return streamUrl(item);
}

export function playbackSource(item: PlayableItem, useFallback = false): { uri: string; headers: Record<string, string>; contentType?: "hls" | "progressive" } {
  const uri = streamUrl(item, useFallback);
  const normalizedUri = uri.toLocaleLowerCase();
  const contentType = normalizedUri.includes(".m3u8") ? "hls" as const : item.kind === "vod" || item.kind === "series" ? "progressive" as const : undefined;
  return {
    uri,
    headers: {
      Accept: "*/*",
      "User-Agent": "VortexPlay/1.7.0 (Android)",
      Referer: `${item.credentials.server}/`,
    },
    ...(contentType ? { contentType } : {}),
  };
}

function groupedM3uSeries(items: PlayableItem[]): PlayableItem[] {
  const grouped = new Map<string, PlayableItem[]>();
  for (const item of items) {
    const key = item.seriesKey || item.title;
    const episodes = grouped.get(key);
    if (episodes) episodes.push(item);
    else grouped.set(key, [item]);
  }
  return [...grouped.entries()].map(([seriesKey, episodes], index) => {
    const first = episodes[0];
    return {
      ...first,
      id: `m3u-series-${index}`,
      title: seriesKey,
      description: `${episodes.length} episódio${episodes.length === 1 ? "" : "s"}`,
      episode: undefined,
      season: undefined,
      seriesKey,
      streamUrl: undefined,
    };
  });
}

export async function getCatalog(
  credentials: XtreamCredentials,
  kind: ContentKind,
  categoryId = "",
  refresh = false,
): Promise<PlayableItem[]> {
  if (credentials.source === "m3u") {
    const entries = (await loadM3u(credentials, refresh)).filter(
      (item) => item.kind === kind && (!categoryId || item.group === categoryId),
    );
    return kind === "series" ? groupedM3uSeries(entries) : entries;
  }

  const response = await xtreamFetch<unknown>(
    buildApiUrl(credentials, streamAction[kind], { category_id: categoryId }),
  );
  if (!Array.isArray(response)) return [];

  const mapped = response.map((entry) => {
    const item = entry as Record<string, unknown>;
    const id = stringValue(kind === "series" ? item.series_id : item.stream_id) || stringValue(item.id);
    if (!id) return null;
    return {
      id,
      title: stringValue(item.name) || "Sem título",
      image: stringValue(item.stream_icon) || stringValue(item.cover),
      description: stringValue(item.plot),
      kind,
      extension: stringValue(item.container_extension) || "mp4",
      duration: Number(item.duration_secs ?? item.duration ?? 0) || undefined,
      production: stringValue(item.production_company) || stringValue(item.producer) || stringValue(item.director),
      group: stringValue(item.category_name),
      categoryId: stringValue(item.category_id),
      credentials,
    } satisfies PlayableItem;
  });
  return mapped.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getEpisodes(
  credentials: XtreamCredentials,
  series: PlayableItem,
): Promise<PlayableItem[]> {
  if (credentials.source === "m3u") {
    return (await loadM3u(credentials))
      .filter((item) => item.kind === "series" && item.seriesKey === series.seriesKey)
      .sort((left, right) => Number(left.season) - Number(right.season) || Number(left.episode) - Number(right.episode));
  }

  const response = await xtreamFetch<Record<string, unknown>>(
    buildApiUrl(credentials, "get_series_info", { series_id: series.id }),
  );
  const seasons = response.episodes;
  if (!seasons || typeof seasons !== "object") return [];

  const entries = Object.entries(seasons as Record<string, unknown>).flatMap(([seasonKey, list]) => {
    if (!Array.isArray(list)) return [];
    return list.map((entry) => {
              const episode = entry as Record<string, unknown>;
        const details = (episode.info ?? {}) as Record<string, unknown>;
        const directSource = stringValue(episode.direct_source) || stringValue(episode.direct_source_url) || stringValue(details.direct_source);

      const season = stringValue(episode.season) || seasonKey;
      const episodeNumber = stringValue(episode.episode_num);
      const title = stringValue(episode.title) || stringValue(episode.name) || `Episódio ${episodeNumber}`;
      return {
        id: stringValue(episode.id) || stringValue(episode.stream_id),
        title: `T${season} E${episodeNumber} · ${title}`,
        image: stringValue(episode.movie_image) || stringValue(details.movie_image) || series.image,
        description: stringValue(details.plot),
        kind: "series" as const,
        extension: normalizeExtension(stringValue(episode.container_extension) || stringValue(details.container_extension) || "mp4"),
        duration: Number(episode.duration_secs ?? episode.duration ?? details.duration_secs ?? details.duration ?? 0) || undefined,
        production: stringValue(details.production_company) || stringValue(details.producer) || stringValue(episode.production_company) || stringValue(episode.producer),
        season,
        episode: episodeNumber,
        seriesId: series.id,
        streamUrl: directSource || undefined,
        fallbackStreamUrl: canonicalStreamUrl({
          id: stringValue(episode.id) || stringValue(episode.stream_id),
          title,
          image: "",
          description: "",
          kind: "series",
          extension: normalizeExtension(stringValue(episode.container_extension) || stringValue(details.container_extension) || "mp4"),
          credentials,
        }),
        credentials,
      } satisfies PlayableItem;
    });
  });

  return entries
    .filter((entry) => entry.id)
    .sort((left, right) => Number(left.season) - Number(right.season) || Number(left.episode) - Number(right.episode));
}
