import { describe, expect, it } from "vitest";

import { getCatalog, parseM3uPlaylist, playbackSource, playbackUrl, prepareCredentials, validateAccount } from "./xtream";
import {
  clampPlaybackPosition,
  clearPlaybackSeekIfReached,
  millisecondsToPlaybackSeconds,
  progressToPlaybackPosition,
  validPlaybackDuration,
} from "./player";

describe("prepareCredentials", () => {
  it("aceita uma URL Xtream completa e extrai usuário e senha", () => {
    expect(
      prepareCredentials(
        "https://stream.exemplo.com:8080/get.php?username=cliente&password=segredo&type=m3u_plus",
        "",
        "",
      ),
    ).toEqual({
      server: "https://stream.exemplo.com:8080",
      username: "cliente",
      password: "segredo",
    });
  });

  it("preserva as credenciais digitadas quando recebe somente o servidor", () => {
    expect(prepareCredentials("meu-servidor.com/", "usuario", "senha")).toEqual({
      server: "http://meu-servidor.com",
      username: "usuario",
      password: "senha",
    });
  });
});

describe("playback controls", () => {
  it("limita o avanço e o retrocesso ao intervalo do vídeo", () => {
    expect(clampPlaybackPosition(42, 10, 100)).toBe(52);
    expect(clampPlaybackPosition(4, -10, 100)).toBe(0);
    expect(clampPlaybackPosition(98, 10, 100)).toBe(100);
  });

  it("converte o toque na barra para uma posição válida", () => {
    expect(progressToPlaybackPosition(0, 120)).toBe(0);
    expect(progressToPlaybackPosition(0.5, 120)).toBe(60);
    expect(progressToPlaybackPosition(1.5, 120)).toBe(120);
  });

  it("normaliza a duração e o tempo do LibVLC", () => {
    expect(millisecondsToPlaybackSeconds(90_000)).toBe(90);
    expect(validPlaybackDuration(0, undefined, 125)).toBe(125);
    expect(validPlaybackDuration(0, null)).toBe(0);
  });

  it("mantém o seek solicitado até o evento nativo alcançá-lo", () => {
    expect(clearPlaybackSeekIfReached(0, 70)).toBe(70);
    expect(clearPlaybackSeekIfReached(69.2, 70)).toBeNull();
    expect(clearPlaybackSeekIfReached(70, null)).toBeNull();
  });
});

describe("playbackSource", () => {
  const credentials = { server: "http://stream.exemplo", username: "ana", password: "senha" };

  it("deixa o player detectar canais MPEG-TS sem forçar progressive", () => {
    const source = playbackSource({ id: "11", title: "Canal", image: "", description: "", kind: "live", extension: "ts", streamUrl: "http://stream.exemplo/live/ana/senha/11.ts", credentials });
    expect(source.uri).toContain("/live/ana/senha/11.ts");
    expect(source.contentType).toBeUndefined();
    expect(source.headers.Referer).toBe("http://stream.exemplo/");
  });

  it("marca playlists HLS como hls", () => {
    const source = playbackSource({ id: "12", title: "Filme HLS", image: "", description: "", kind: "vod", extension: "m3u8", streamUrl: "http://stream.exemplo/movie/ana/senha/12.m3u8", credentials });
    expect(source.contentType).toBe("hls");
  });

  it("usa uma fonte alternativa canônica para filme quando a fonte direta falha", () => {
    const item = {
      id: "22",
      title: "Filme",
      image: "",
      description: "",
      kind: "vod" as const,
      extension: "mp4",
      streamUrl: "http://stream.exemplo/direct/22.mp4",
      fallbackStreamUrl: "http://stream.exemplo/movie/ana/senha/22.mp4",
      credentials,
    };
    expect(playbackSource(item).uri).toBe("http://stream.exemplo/direct/22.mp4");
    expect(playbackSource(item, true).uri).toBe("http://stream.exemplo/movie/ana/senha/22.mp4");
  });
});

describe("playbackUrl", () => {
  it("monta uma URL canônica de filme sem duplicar a barra do servidor", () => {
    expect(
      playbackUrl({
        id: "22",
        title: "Filme",
        image: "",
        description: "",
        kind: "vod",
        extension: ".mp4",
        credentials: { server: "https://stream.exemplo.com///", username: "ana@email", password: "senha 123" },
      }),
    ).toBe("https://stream.exemplo.com/movie/ana%40email/senha%20123/22.mp4");
  });

  it("monta uma URL de episódio com credenciais codificadas", () => {
    expect(
      playbackUrl({
        id: "35",
        title: "T1 E1 · Piloto",
        image: "",
        description: "",
        kind: "series",
        extension: "mkv",
        credentials: { server: "https://stream.exemplo.com", username: "ana@email", password: "senha 123" },
      }),
    ).toBe("https://stream.exemplo.com/series/ana%40email/senha%20123/35.mkv");
  });

  it("preserva uma fonte direta de episódio quando fornecida pelo provedor", () => {
    expect(
      playbackUrl({
        id: "35",
        title: "T1 E1 · Piloto",
        image: "",
        description: "",
        kind: "series",
        extension: ".mp4",
        streamUrl: "https://stream.exemplo.com/direct/35.m3u8?token=abc",
        credentials: { server: "https://stream.exemplo.com", username: "ana", password: "senha" },
      }),
    ).toBe("https://stream.exemplo.com/direct/35.m3u8?token=abc");
  });
});

describe("parseM3uPlaylist", () => {
  it("classifica canais, filmes e episódios de série pelos caminhos e preserva a URL de stream", () => {
    const items = parseM3uPlaylist(
      `#EXTM3U
#EXTINF:-1 tvg-logo="https://imagem.exemplo/canal.png" group-title="Notícias",Canal Agora
http://stream.exemplo/live/ana/senha/11.ts
#EXTINF:-1 group-title="Filmes",Aventura ao Norte
http://stream.exemplo/movie/ana/senha/22.mp4
#EXTINF:-1 group-title="Séries",Arquivo Azul S01 E02
http://stream.exemplo/series/ana/senha/33.mkv`,
      { server: "http://stream.exemplo", username: "ana", password: "senha" },
    );

    expect(items.map((item) => item.kind)).toEqual(["live", "vod", "series"]);
    expect(items[0]?.streamUrl).toContain("/live/ana/senha/11.ts");
    expect(items[2]).toMatchObject({ seriesKey: "Arquivo Azul", season: "01", episode: "02" });
  });
});

describe("validateAccount", () => {
  it("usa a playlist M3U quando a API JSON não é disponibilizada pelo provedor", async () => {
    const originalFetch = globalThis.fetch;
    const responses = [
      new Response("Página não encontrada", { status: 404 }),
      new Response("#EXTM3U\n#EXTINF:-1 group-title=\"Canais\",Canal Teste\nhttp://stream.exemplo/live/ana/senha/44.ts"),
    ];
    globalThis.fetch = async () => responses.shift() as Response;

    await expect(validateAccount({ server: "http://stream.exemplo", username: "ana", password: "senha" }))
      .resolves.toMatchObject({ source: "m3u" });

    globalThis.fetch = originalFetch;
  });

  const hasIntegrationCredentials = Boolean(
    process.env.VORTEX_XTREAM_SERVER
    && process.env.VORTEX_XTREAM_USER
    && process.env.VORTEX_XTREAM_PASSWORD,
  );

  it.skipIf(!hasIntegrationCredentials)("valida uma lista M3U autorizada sem salvar dados de acesso", async () => {
    const account = await validateAccount({
      server: process.env.VORTEX_XTREAM_SERVER ?? "",
      username: process.env.VORTEX_XTREAM_USER ?? "",
      password: process.env.VORTEX_XTREAM_PASSWORD ?? "",
    });
    const [live, vod, series] = await Promise.all([
      getCatalog(account, "live"),
      getCatalog(account, "vod"),
      getCatalog(account, "series"),
    ]);

    expect(["api", "m3u"]).toContain(account.source);
    expect(live.length).toBeGreaterThan(0);
    expect(vod.length).toBeGreaterThan(0);
    expect(series.length).toBeGreaterThan(0);
  }, 360_000);
});


describe("cache e agrupamento M3U", () => {
  it("recarrega a M3U quando refresh é solicitado e reutiliza o cache normalmente", async () => {
    const originalFetch = globalThis.fetch;
    const firstPlaylist = "#EXTM3U\n#EXTINF:-1 group-title=\"Filmes\",Filme Antigo\nhttp://stream.exemplo/movie/u/p/1.mp4";
    const refreshedPlaylist = "#EXTM3U\n#EXTINF:-1 group-title=\"Filmes\",Filme Novo\nhttp://stream.exemplo/movie/u/p/2.mp4";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(calls === 1 ? firstPlaylist : refreshedPlaylist);
    };

    try {
      const account = { server: "http://refresh-cache.test", username: "u", password: "p", source: "m3u" as const };
      await expect(getCatalog(account, "vod")).resolves.toMatchObject([{ title: "Filme Antigo" }]);
      await expect(getCatalog(account, "vod")).resolves.toMatchObject([{ title: "Filme Antigo" }]);
      await expect(getCatalog(account, "vod", "", true)).resolves.toMatchObject([{ title: "Filme Novo" }]);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("agrupa episódios M3U da mesma série sem alterar a quantidade de séries", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      "#EXTM3U\n" +
      "#EXTINF:-1 group-title=\"Séries\",Arquivo Azul S01 E01\nhttp://stream.exemplo/series/u/p/1.mp4\n" +
      "#EXTINF:-1 group-title=\"Séries\",Arquivo Azul S01 E02\nhttp://stream.exemplo/series/u/p/2.mp4\n" +
      "#EXTINF:-1 group-title=\"Séries\",Outra Série S01 E01\nhttp://stream.exemplo/series/u/p/3.mp4",
    );

    try {
      const account = { server: "http://series-group.test", username: "u", password: "p", source: "m3u" as const };
      await expect(getCatalog(account, "series")).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ title: "Arquivo Azul", description: "2 episódios" }),
        expect.objectContaining({ title: "Outra Série", description: "1 episódio" }),
      ]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

  it("compartilha uma requisição M3U em andamento entre setores simultâneos", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        "#EXTM3U\n" +
        "#EXTINF:-1 group-title=\"Canais\",Canal Teste\nhttp://stream.exemplo/live/u/p/1.ts\n" +
        "#EXTINF:-1 group-title=\"Filmes\",Filme Teste\nhttp://stream.exemplo/movie/u/p/2.mp4\n" +
        "#EXTINF:-1 group-title=\"Séries\",Série Teste S01 E01\nhttp://stream.exemplo/series/u/p/3.mp4",
      );
    };

    try {
      const account = { server: "http://inflight.test", username: "u", password: "p", source: "m3u" as const };
      const [live, vod, series] = await Promise.all([
        getCatalog(account, "live", "", true),
        getCatalog(account, "vod", "", true),
        getCatalog(account, "series", "", true),
      ]);
      expect(calls).toBe(1);
      expect(live).toHaveLength(1);
      expect(vod).toHaveLength(1);
      expect(series).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
