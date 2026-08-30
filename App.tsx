import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { VideoView, useVideoPlayer } from "expo-video";
import { LibVlcPlayerView } from "expo-libvlc-player";
import { clearPlaybackSeekIfReached, millisecondsToPlaybackSeconds, progressToPlaybackPosition, validPlaybackDuration } from "./player";
import { shouldShowLoginAfterOnboarding } from "./session";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Switch,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type ContentKind,
  type PlayableItem,
  type XtreamCategory,
  type XtreamCredentials,
  getCatalog,
  getCategories,
  getEpisodes,
  playbackSource,
  prepareCredentials,
  validateAccount,
} from "./xtream";
import { LEGAL_SECTIONS } from "./legal";
import { clampPlaybackPosition } from "./player";
import { parseStoredCredentials, serializeCredentials } from "./session";

const STORAGE_KEY = "vortex-play-xtream-account";
const ACCOUNT_CACHE_KEY = "vortex-play-xtream-account-cache";
const TABS: { key: ContentKind; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: "live", label: "Canais", icon: "live-tv" },
  { key: "vod", label: "Filmes", icon: "movie" },
  { key: "series", label: "Séries", icon: "slideshow" },
];
const NAV_ITEMS: { key: "home" | ContentKind | "my-list"; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: "home", label: "Início", icon: "home" },
  ...TABS,
  { key: "my-list", label: "Minha lista", icon: "favorite-border" },
];
const FAVORITES_KEY = "vortex-play-favorites";
const CONTINUE_KEY = "vortex-play-continue";
const CATALOG_CACHE_KEY = "vortex-play-catalog-cache";
const FEATURED_MOVIE_KEY = "vortex-play-featured-movie";
const SETTINGS_KEY = "vortex-play-settings";
const LAST_SYNC_KEY = "vortex-play-last-sync";
const ONBOARDING_SEEN_KEY = "vortex-play-onboarding-seen";
const DAILY_SYNC_MS = 24 * 60 * 60 * 1000;
const PROFILE_KEY = "vortex-play-profile";
const PROFILE_PIN_KEY = "vortex-play-profile-pin";
const REMEMBER_LOGIN_KEY = "vortex-play-remember-login";
const INTRO_VIDEO_SOURCE = require("./vortex-intro.mp4");

async function safeSecureGet(key: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

async function safeSecureSet(key: string, value: string): Promise<void> {
  try { await SecureStore.setItemAsync(key, value); } catch { /* O cache AsyncStorage permanece como fallback. */ }
}

async function safeSecureDelete(key: string): Promise<void> {
  try { await SecureStore.deleteItemAsync(key); } catch { /* A remoção do cache local continua normalmente. */ }
}

async function persistLogin(account: XtreamCredentials, remember: boolean): Promise<void> {
  await AsyncStorage.setItem(REMEMBER_LOGIN_KEY, remember ? "1" : "0");
  if (!remember) {
    await Promise.all([safeSecureDelete(STORAGE_KEY), AsyncStorage.removeItem(ACCOUNT_CACHE_KEY)]);
    return;
  }
  const serialized = serializeCredentials(account);
  // AsyncStorage is written first so it remains a reliable fallback on devices where
  // SecureStore is unavailable or temporarily fails.
  await Promise.all([
    AsyncStorage.setItem(ACCOUNT_CACHE_KEY, serialized),
    safeSecureSet(STORAGE_KEY, serialized),
  ]);
  const saved = await AsyncStorage.getItem(ACCOUNT_CACHE_KEY);
  if (saved !== serialized) {
    console.warn("Falha ao confirmar as credenciais no AsyncStorage");
  }
}

async function clearPersistedLogin(): Promise<void> {
  await Promise.all([safeSecureDelete(STORAGE_KEY), AsyncStorage.removeItem(ACCOUNT_CACHE_KEY)]);
}

type SavedProgress = PlayableItem & { position: number; duration: number };
type PlayerState = { queue: PlayableItem[]; index: number } | null;
type AppPreferences = {
  showContinue: boolean;
  autoplayNext: boolean;
  hardwareAcceleration: boolean;
  appLanguage: string;
  audioLanguage: string;
  subtitleLanguage: string;
};
const DEFAULT_PREFERENCES: AppPreferences = {
  showContinue: true,
  autoplayNext: true,
  hardwareAcceleration: true,
  appLanguage: "Português · Sistema",
  audioLanguage: "Português",
  subtitleLanguage: "Português",
};

function pressFeedback() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function VortexMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <Image source={require("./icon.png")} style={compact ? styles.markSmall : styles.mark} />
      {!compact && (
        <View>
          <Text style={styles.wordmark}>VÓRTEX PLAY</Text>
          <Text style={styles.wordmarkCaption}>ENTRETENIMENTO</Text>
        </View>
      )}
    </View>
  );
}

function channelMonogram(rawTitle: string) {
  const title = displayTitle(rawTitle).title.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").trim();
  return title.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "TV";
}

function displayTitle(rawTitle: string) {
  const labels: string[] = [];
  const clean = rawTitle.replace(/\s*\[([^\]]+)\]/g, (_match, tag: string) => {
    const normalized = tag.trim().toUpperCase();
    if (["CAM", "L", "HD", "SD", "4K"].includes(normalized)) labels.push(normalized);
    return "";
  }).replace(/\s{2,}/g, " ").trim();
  return { title: clean || rawTitle, labels };
}

function countLabel(count: number) {
  return `${count} ${count === 1 ? "título" : "títulos"}`;
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function QualityBadges({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return <View style={styles.qualityBadges}>{labels.map((label) => <View key={label} style={styles.qualityBadge}><Text style={styles.qualityBadgeText}>{label}</Text></View>)}</View>;
}

function SettingSwitch({ icon, label, value, onChange }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.settingRow}><View style={styles.settingIcon}><MaterialIcons name={icon} size={20} color="#D6C7FF" /></View><Text style={styles.settingLabel}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: "#393441", true: "#7C4DCC" }} thumbColor={value ? "#F7F3FF" : "#AAA5B5"} /></View>;
}

function PreferenceRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.preferenceRow}><View><Text style={styles.preferenceLabel}>{label}</Text><Text style={styles.preferenceValue}>{value}</Text></View><MaterialIcons name="chevron-right" size={21} color="#8D859B" /></Pressable>;
}

function SkeletonGrid() {
  return <View style={styles.skeletonGrid}>{[0, 1, 2, 3].map((item) => <View key={item} style={styles.skeletonCard}><View style={styles.skeletonPoster} /><View style={styles.skeletonLine} /></View>)}</View>;
}

function CatalogRail({ title, data, onPlay }: { title: string; data: PlayableItem[]; onPlay: (item: PlayableItem) => void }) {
  if (!data.length) return null;
  return (
    <View style={styles.railSection}>
      <View style={styles.railHeading}><Text style={styles.railTitle}>{title}</Text><Text style={styles.railCount}>{countLabel(data.length)}</Text></View>
      <FlatList
        horizontal
        data={data}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railList}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPlay(item)} style={({ pressed }) => [styles.railCard, pressed && styles.posterPressed]}>
            {item.image ? <Image source={{ uri: item.image }} resizeMode={item.kind === "live" ? "contain" : "cover"} style={styles.railPoster} /> : <View style={[styles.railPoster, styles.posterFallback, item.kind === "live" && styles.channelFallback]}>{item.kind === "live" ? <Text style={styles.channelMonogram}>{channelMonogram(item.title)}</Text> : <MaterialIcons name="play-circle-outline" size={30} color="#A78BFA" />}</View>}
            <View style={styles.railPosterShade} />
            <QualityBadges labels={displayTitle(item.title).labels} />
            <Text style={styles.railCardTitle} numberOfLines={2}>{displayTitle(item.title).title}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function FavoriteGrid({ title, data, onPlay }: { title: string; data: PlayableItem[]; onPlay: (item: PlayableItem) => void }) {
  if (!data.length) return null;
  return (
    <View style={styles.favoriteSection}>
      <View style={styles.railHeading}><Text style={styles.railTitle}>{title}</Text><Text style={styles.railCount}>{countLabel(data.length)}</Text></View>
      <View style={styles.favoriteGrid}>
        {data.map((item) => (
          <Pressable key={`${item.kind}-${item.id}`} onPress={() => onPlay(item)} style={({ pressed }) => [styles.posterCard, pressed && styles.posterPressed]}>
            {item.image ? <Image source={{ uri: item.image }} resizeMode={item.kind === "live" ? "contain" : "cover"} style={styles.poster} /> : <View style={[styles.poster, styles.posterFallback, item.kind === "live" && styles.channelFallback]}>{item.kind === "live" ? <Text style={styles.channelMonogram}>{channelMonogram(item.title)}</Text> : <MaterialIcons name="play-circle-outline" size={36} color="#A78BFA" />}</View>}
            <View style={styles.posterShade} />
            <QualityBadges labels={displayTitle(item.title).labels} />
            <View style={styles.posterType}><Text style={styles.posterTypeText}>{item.kind === "live" ? "AO VIVO" : item.kind === "vod" ? "FILME" : "SÉRIE"}</Text></View>
            <Text style={styles.posterTitle} numberOfLines={2}>{displayTitle(item.title).title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Player({ state, onClose, onNext, onProgress, resumePosition = 0, autoplayNext }: { state: NonNullable<PlayerState>; onClose: () => void; onNext: () => void; onProgress: (item: PlayableItem, position: number, duration: number) => void; resumePosition?: number; autoplayNext: boolean }) {
  const item = state.queue[state.index];
  const [useFallback, setUseFallback] = useState(false);
  const source = playbackSource(item, useFallback);
  const vlcRef = useRef<React.ElementRef<typeof LibVlcPlayerView>>(null);
  const [currentTime, setCurrentTime] = useState(resumePosition);
  const [duration, setDuration] = useState(item.duration ?? 0);
  const [progressWidth, setProgressWidth] = useState(0);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(true);
  const scrubTimeRef = useRef(resumePosition);
  const scrubbingRef = useRef(false);
  const lastProgressSaveRef = useRef(resumePosition);
  const seekQueueRef = useRef<Promise<void>>(Promise.resolve());
  const requestedSeekRef = useRef<number | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const progressRatio = duration > 0 ? Math.max(0, Math.min(currentTime / duration, 1)) : 0;
  const canSeek = item.kind !== "live";
  const canScrub = item.kind !== "live" && duration > 0;
  const vlcOptions = useMemo(() => [
    "--network-caching=1500",
    "--http-reconnect",
    "--avcodec-hw=any",
    ":http-user-agent=" + source.headers["User-Agent"],
    ":http-referrer=" + source.headers.Referer,
  ], [source.headers.Referer, source.headers]);

  useEffect(() => {
    setUseFallback(false);
    setError("");
  }, [item.id]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const scheduleControlsHide = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
  };

  const revealControls = () => {
    setControlsVisible(true);
    scheduleControlsHide();
  };

  const toggleControls = () => {
    if (controlsVisible) {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      setControlsVisible(false);
    } else {
      revealControls();
    }
  };

  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setError("");
    setCurrentTime(resumePosition);
    setDuration(validPlaybackDuration(item.duration));
    requestedSeekRef.current = null;
    setProgressWidth(0);
    setIsPlaying(true);
    scrubTimeRef.current = resumePosition;
    lastProgressSaveRef.current = resumePosition;
  }, [item.id, resumePosition]);

  const updateTime = (nextMilliseconds: number) => {
    const nextSeconds = Math.max(0, nextMilliseconds / 1000);
    requestedSeekRef.current = clearPlaybackSeekIfReached(nextSeconds, requestedSeekRef.current);
    if (requestedSeekRef.current === null && !scrubbingRef.current) setCurrentTime(nextSeconds);
    scrubTimeRef.current = requestedSeekRef.current === null ? nextSeconds : scrubTimeRef.current;
    const loadedDuration = validPlaybackDuration(duration, item.duration);
    if (loadedDuration > 0 && loadedDuration !== duration) setDuration(loadedDuration);
    if (item.kind !== "live" && loadedDuration > 0 && Math.abs(nextSeconds - lastProgressSaveRef.current) >= 5) {
      lastProgressSaveRef.current = nextSeconds;
      onProgress(item, nextSeconds, loadedDuration);
    }
  };

  const enqueueSeek = (next: number) => {
    revealControls();
    seekQueueRef.current = seekQueueRef.current
      .catch(() => undefined)
      .then(() => {
        requestedSeekRef.current = next;
        setCurrentTime(next);
        scrubTimeRef.current = next;
        const request = () => vlcRef.current?.seek(next * 1000, "time") ?? Promise.resolve();
        return request().catch(() => new Promise<void>((resolve) => setTimeout(resolve, 300)).then(request));
      })
      .then(() => {
        setCurrentTime(next);
        scrubTimeRef.current = next;
      })
      .catch(() => setError("Não foi possível alterar a posição deste vídeo."));
  };

  const commitScrub = () => {
    if (!canScrub) return;
    scrubbingRef.current = false;
    const next = Math.max(0, Math.min(duration, scrubTimeRef.current));
    // Atualiza a interface imediatamente; o evento nativo confirma depois.
    setCurrentTime(next);
    scrubTimeRef.current = next;
    onProgress(item, next, duration);
    enqueueSeek(next);
  };

  const progressResponder = useMemo(() => PanResponder.create({
    // Capture the whole progress area so a tap anywhere on the line starts a seek,
    // not only a drag that begins exactly on the thumb.
    onStartShouldSetPanResponder: () => canScrub,
    onMoveShouldSetPanResponder: () => canScrub,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      if (!canScrub || progressWidth <= 0) return;
      scrubbingRef.current = true;
      scrubTimeRef.current = progressToPlaybackPosition(event.nativeEvent.locationX / progressWidth, duration);
      setCurrentTime(scrubTimeRef.current);
      revealControls();
    },
    onPanResponderMove: (event) => {
      if (!canScrub || progressWidth <= 0) return;
      scrubTimeRef.current = progressToPlaybackPosition(event.nativeEvent.locationX / progressWidth, duration);
      setCurrentTime(scrubTimeRef.current);
    },
    onPanResponderRelease: commitScrub,
    onPanResponderTerminate: commitScrub,
  }), [canScrub, duration, progressWidth]);

  const seekBy = (delta: number) => {
    if (!canSeek) return;
    const next = duration > 0
      ? clampPlaybackPosition(scrubTimeRef.current, delta, duration)
      : Math.max(0, scrubTimeRef.current + delta);
    scrubTimeRef.current = next;
    onProgress(item, next, duration);
    enqueueSeek(next);
  };

  return (
    <View style={styles.playerRoot}>
      <StatusBar style="light" hidden />
      <LibVlcPlayerView
        key={`${item.id}-${useFallback ? "fallback" : "direct"}`}
        ref={vlcRef}
        source={source.uri}
        options={vlcOptions}
        time={resumePosition * 1000}
        volume={100}
        mute={false}
        autoplay
        contentFit="contain"
        style={styles.video}
        onPlaying={() => setIsPlaying(true)}
        onPaused={() => setIsPlaying(false)}
        onTimeChanged={(event) => updateTime(event.value)}
        onPositionChanged={(event) => {
          if (duration <= 0 || scrubbingRef.current) return;
          const nextSeconds = progressToPlaybackPosition(event.value, duration);
          requestedSeekRef.current = clearPlaybackSeekIfReached(nextSeconds, requestedSeekRef.current);
          if (requestedSeekRef.current !== null) return;
          setCurrentTime(nextSeconds);
          scrubTimeRef.current = nextSeconds;
        }}
        onFirstPlay={(event) => {
          const lengthSeconds = millisecondsToPlaybackSeconds(event.length);
          const nextDuration = validPlaybackDuration(lengthSeconds, item.duration);
          if (nextDuration > 0) setDuration(nextDuration);
        }}
        onESAdded={(event) => {
          if (event.audio.length > 0) setError("");
        }}
        onStopped={() => setIsPlaying(false)}
        onEncounteredError={() => {
          if (item.kind !== "live" && !useFallback && item.fallbackStreamUrl) {
            setError(item.kind === "vod" ? "Tentando a fonte alternativa do filme…" : "Tentando a fonte alternativa do episódio…");
            setUseFallback(true);
            return;
          }
          setError("A fonte não pôde ser reproduzida. Tente novamente ou escolha outro conteúdo.");
        }}
      />
      <Pressable style={styles.playerTouchSurface} onPress={toggleControls} accessibilityLabel={controlsVisible ? "Ocultar controles" : "Mostrar controles"} />
      {controlsVisible ? <View style={styles.playerControlsLayer} pointerEvents="box-none" onTouchStart={revealControls}>
      <View style={styles.playerTopBar}>
        <Pressable style={styles.playerBack} onPress={onClose} accessibilityLabel="Voltar ao catálogo">
          <MaterialIcons name="arrow-back" size={26} color="#FFFFFF" />
        </Pressable>
        <View style={styles.playerTitleBox}>
          <Text style={styles.playerTitle} numberOfLines={1}>{item.title}</Text>
          {item.kind === "series" && <Text style={styles.playerSubtitle}>{autoplayNext ? "Próximo episódio automático" : "Avanço automático desativado"}</Text>}
          <Text style={styles.playerMeta} numberOfLines={1}>{item.production ? "Produção: " + item.production : "Produção: não informada pela fonte"}</Text>
        </View>
      </View>
      <View style={styles.playerProgressPanel}>
        <View style={styles.playerTimeRow}>
          <Text style={styles.playerTimeText}>{formatPlaybackTime(currentTime)}</Text>
          <Text style={styles.playerTimeText}>{duration > 0 ? formatPlaybackTime(duration) : "--:--"}</Text>
        </View>
        <View style={styles.progressTouchArea} onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)} {...progressResponder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Barra de progresso">
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progressRatio * 100}%` as `${number}%` }]} /></View>
          <View style={[styles.progressThumb, { left: Math.max(0, progressRatio * progressWidth - 6) }]} />
        </View>
      </View>
      <View style={styles.customControls}>
        <Pressable style={[styles.playerControl, !canSeek && styles.playerControlDisabled]} onPress={() => seekBy(-10)} disabled={!canSeek} accessibilityLabel="Voltar 10 segundos">
          <MaterialIcons name="replay-10" size={28} color={canSeek ? "#FFFFFF" : "#716B7A"} />
          <Text style={[styles.controlLabel, !canSeek && styles.controlLabelDisabled]}>10 s</Text>
        </Pressable>
        <Pressable style={[styles.playerControl, styles.playControl]} onPress={() => { if (isPlaying) void vlcRef.current?.pause(); else void vlcRef.current?.play(); }} accessibilityLabel={isPlaying ? "Pausar" : "Reproduzir"}>
          <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={34} color="#121016" />
        </Pressable>
        <Pressable style={[styles.playerControl, !canSeek && styles.playerControlDisabled]} onPress={() => seekBy(10)} disabled={!canSeek} accessibilityLabel="Avançar 10 segundos">
          <MaterialIcons name="forward-10" size={28} color={canSeek ? "#FFFFFF" : "#716B7A"} />
          <Text style={[styles.controlLabel, !canSeek && styles.controlLabelDisabled]}>10 s</Text>
        </Pressable>
      </View>
      </View> : null}
      {error ? <View style={styles.playerError}><Text style={styles.playerErrorText}>{error}</Text><Pressable onPress={onClose} style={styles.playerErrorBack}><Text style={styles.playerErrorBackText}>Voltar ao catálogo</Text></Pressable></View> : null}
    </View>
  );
}

function OnboardingScreen({ onNext }: { onNext: () => void }) {
  return (
    <SafeAreaView style={styles.onboardingRoot} edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.onboardingContent} showsVerticalScrollIndicator={false}>
        <View pointerEvents="none" style={styles.onboardingGlow} />
        <View style={styles.onboardingBrand}>
          <Image source={require("./icon.png")} style={styles.onboardingLogo} />
          <Text style={styles.onboardingBrandName}>VÓRTEX PLAY</Text>
        </View>
        <View style={styles.onboardingCopy}>
          <Text style={styles.onboardingTitle}>Bem-vindo ao Vórtex Play</Text>
          <Text style={styles.onboardingSubtitle}>Seu portal definitivo de filmes, séries e TV ao vivo</Text>
        </View>
        <Pressable onPress={onNext} style={({ pressed }) => [styles.onboardingNext, pressed && styles.onboardingNextPressed]} accessibilityRole="button" accessibilityLabel="Próximo">
          <Text style={styles.onboardingNextText}>PRÓXIMO</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function AppScreen() {
  const insets = useSafeAreaInsets();
  const [showSplash, setShowSplash] = useState(true);
  const [bootReady, setBootReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [credentials, setCredentials] = useState<XtreamCredentials | null>(null);
  const credentialsRef = useRef<XtreamCredentials | null>(null);
  const [tab, setTab] = useState<ContentKind>("live");
  const [view, setView] = useState<"home" | ContentKind | "my-list">("home");
  const [categories, setCategories] = useState<XtreamCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [items, setItems] = useState<PlayableItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [catalogs, setCatalogs] = useState<Record<ContentKind, PlayableItem[]>>({ live: [], vod: [], series: [] });
  const [featuredMovie, setFeaturedMovie] = useState<PlayableItem | null>(null);
  const [screenTitle, setScreenTitle] = useState("Canais ao vivo");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showLogin, setShowLogin] = useState(true);
  const [loginMode, setLoginMode] = useState<"server" | "m3u">("server");
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [playerState, setPlayerState] = useState<PlayerState>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState<PlayableItem[]>([]);
  const [continueItems, setContinueItems] = useState<SavedProgress[]>([]);
  const [selectedItem, setSelectedItem] = useState<PlayableItem | null>(null);
  const [detailEpisodes, setDetailEpisodes] = useState<PlayableItem[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferencePicker, setPreferencePicker] = useState<keyof Pick<AppPreferences, "appLanguage" | "audioLanguage" | "subtitleLanguage"> | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [profileOpen, setProfileOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalSection, setLegalSection] = useState<(typeof LEGAL_SECTIONS)[number]["id"]>("terms");
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [profileName, setProfileName] = useState("Meu perfil");
  const [pin, setPin] = useState("");
  const [ageRating, setAgeRating] = useState("Livre");
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const syncingRef = useRef(false);
  const finishSplash = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((seen) => setShowOnboarding(seen !== "1"));
    void AsyncStorage.getItem(REMEMBER_LOGIN_KEY).then((saved) => setRememberLogin(saved !== "0"));
    void safeSecureGet(PROFILE_PIN_KEY).then((savedPin) => { if (savedPin) setPin(savedPin); });
    void AsyncStorage.getItem(PROFILE_KEY).then((savedProfile) => {
      if (!savedProfile) return;
      try {
        const profile = JSON.parse(savedProfile) as { name?: string; ageRating?: string };
        setProfileName(profile.name || "Meu perfil");
        setAgeRating(profile.ageRating || "Livre");
      } catch { void AsyncStorage.removeItem(PROFILE_KEY); }
    });
    void AsyncStorage.getItem(SETTINGS_KEY).then((savedSettings) => {
      if (!savedSettings) return;
      try {
        const saved = JSON.parse(savedSettings) as Partial<AppPreferences>;
        setPreferences({
          showContinue: saved.showContinue ?? DEFAULT_PREFERENCES.showContinue,
          autoplayNext: saved.autoplayNext ?? DEFAULT_PREFERENCES.autoplayNext,
          hardwareAcceleration: saved.hardwareAcceleration ?? DEFAULT_PREFERENCES.hardwareAcceleration,
          appLanguage: saved.appLanguage ?? DEFAULT_PREFERENCES.appLanguage,
          audioLanguage: saved.audioLanguage ?? DEFAULT_PREFERENCES.audioLanguage,
          subtitleLanguage: saved.subtitleLanguage ?? DEFAULT_PREFERENCES.subtitleLanguage,
        });
      } catch { void AsyncStorage.removeItem(SETTINGS_KEY); }
    });
    void Promise.all([safeSecureGet(STORAGE_KEY), AsyncStorage.getItem(ACCOUNT_CACHE_KEY), safeSecureGet(FAVORITES_KEY), safeSecureGet(CONTINUE_KEY), AsyncStorage.getItem(CATALOG_CACHE_KEY), AsyncStorage.getItem(FEATURED_MOVIE_KEY)]).then(([savedSecure, savedAccountCache, savedFavorites, savedContinue, savedCatalog, savedFeatured]) => {
      // A existência de uma conta válida é a fonte de verdade. A flag legada pode
      // estar ausente ou desatualizada após uma atualização; quando o usuário
      // desativa o salvamento, persistLogin remove os dois armazenamentos.
      const savedAccount = parseStoredCredentials([savedSecure, savedAccountCache]);
      if (savedFavorites) {
        try { setFavorites(JSON.parse(savedFavorites) as PlayableItem[]); } catch { void safeSecureDelete(FAVORITES_KEY); }
      }
      if (savedContinue) {
        try { setContinueItems(JSON.parse(savedContinue) as SavedProgress[]); } catch { void safeSecureDelete(CONTINUE_KEY); }
      }
      if (savedCatalog) {
        try {
          const cachedCatalog = JSON.parse(savedCatalog) as Record<ContentKind, PlayableItem[]>;
          setCatalogs({ live: cachedCatalog.live ?? [], vod: cachedCatalog.vod ?? [], series: cachedCatalog.series ?? [] });
          if (cachedCatalog.live?.length) setItems(cachedCatalog.live);
        } catch { void AsyncStorage.removeItem(CATALOG_CACHE_KEY); }
      }
      if (savedFeatured) {
        try { setFeaturedMovie(JSON.parse(savedFeatured) as PlayableItem); } catch { void AsyncStorage.removeItem(FEATURED_MOVIE_KEY); }
      }
      if (!savedAccount) return;
      setServer(savedAccount.server);
      setUsername(savedAccount.username);
      setPassword(savedAccount.password);
      credentialsRef.current = savedAccount;
      setCredentials(savedAccount);
      setShowOnboarding(false);
      setShowLogin(false);
    }).finally(() => setBootReady(true));
  }, []);

  useEffect(() => {
    if (!credentials) return;
    let previousState: string = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const returnedToForeground = /inactive|background/.test(previousState) && nextState === "active";
      previousState = nextState;
      if (returnedToForeground) void refreshCatalogIfDue(credentials);
    });
    void refreshCatalogIfDue(credentials);
    return () => subscription.remove();
  }, [credentials]);

  const searchableCatalog = useMemo(() => {
    const unique = new Map<string, PlayableItem>();
    [...catalogs.live, ...catalogs.vod, ...catalogs.series, ...items].forEach((item) => unique.set(`${item.kind}-${item.id}`, item));
    return [...unique.values()];
  }, [catalogs, items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? items.filter((item) => item.title.toLocaleLowerCase().includes(query)) : items;
  }, [items, search]);

  const displayItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
  const homeMovieItems = useMemo(() => catalogs.vod.filter((item) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || `${item.title} ${item.description} ${item.group ?? ""}`.toLocaleLowerCase().includes(query);
  }).slice(0, visibleCount), [catalogs.vod, search, visibleCount]);

  useEffect(() => {
    setVisibleCount(20);
  }, [view, tab, categoryId, search]);

  const globalResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? searchableCatalog.filter((item) => `${item.title} ${item.description} ${item.group ?? ""}`.toLocaleLowerCase().includes(query)) : searchableCatalog;
  }, [search, searchableCatalog]);

  const liveCategoryGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const groups = new Map<string, PlayableItem[]>();
    catalogs.live
      .filter((item) => !categoryId || item.categoryId === categoryId || item.group === categoryId)
      .filter((item) => !query || `${item.title} ${item.group ?? ""}`.toLocaleLowerCase().includes(query))
      .forEach((item) => {
        const categoryName = item.group || categories.find((category) => category.id === item.categoryId)?.name || "Outros canais";
        groups.set(categoryName, [...(groups.get(categoryName) ?? []), item]);
      });
    return [...groups.entries()];
  }, [catalogs.live, categories, categoryId, search]);

  function updatePreferences(update: Partial<AppPreferences>) {
    setPreferences((current) => {
      const next = { ...current, ...update };
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function saveProfile(update: Partial<{ name: string; ageRating: string }>) {
    const next = { name: update.name ?? profileName, ageRating: update.ageRating ?? ageRating };
    setProfileName(next.name);
    setAgeRating(next.ageRating);
    void AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }

  function savePin() {
    if (pin.length === 4) {
      void safeSecureSet(PROFILE_PIN_KEY, pin);
      pressFeedback();
    }
  }

  function resetLanguages() {
    updatePreferences({ appLanguage: "Português · Sistema", audioLanguage: "Português", subtitleLanguage: "Português" });
    pressFeedback();
  }

  function completeOnboarding() {
    void AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    setShowOnboarding(false);
    setShowLogin(shouldShowLoginAfterOnboarding(Boolean(credentialsRef.current)));
    setView("home");
  }

  function selectView(nextView: "home" | ContentKind | "my-list") {
    setMenuOpen(false);
    setSearchOpen(false);
    setSearch("");
    setView(nextView);
    if (nextView === "home" || nextView === "my-list") return;
    void loadTab(nextView);
  }

  function toggleFavorite(item: PlayableItem) {
    setFavorites((current) => {
      const next = current.some((entry) => entry.id === item.id) ? current.filter((entry) => entry.id !== item.id) : [item, ...current];
      void SecureStore.setItemAsync(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
    pressFeedback();
  }

  function saveProgress(item: PlayableItem, position: number, duration: number) {
    if (item.kind === "live" || position < 5) return;
    setContinueItems((current) => {
      const nextItem = { ...item, position, duration };
      const next = [nextItem, ...current.filter((entry) => entry.id !== item.id)].slice(0, 12);
      void SecureStore.setItemAsync(CONTINUE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function persistCatalogs(update: Partial<Record<ContentKind, PlayableItem[]>>) {
    setCatalogs((current) => {
      const nextCatalogs = { ...current, ...update };
      void AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(nextCatalogs));
      return nextCatalogs;
    });
  }

  async function loadAllCatalogs(account: XtreamCredentials, refresh = false): Promise<Record<ContentKind, PlayableItem[]>> {
    const [liveResult, vodResult, seriesResult] = await Promise.allSettled([
      getCatalog(account, "live", "", refresh),
      getCatalog(account, "vod", "", refresh),
      getCatalog(account, "series", "", refresh),
    ]);
    const nextCatalogs = {
      live: liveResult.status === "fulfilled" ? liveResult.value : catalogs.live,
      vod: vodResult.status === "fulfilled" ? vodResult.value : catalogs.vod,
      series: seriesResult.status === "fulfilled" ? seriesResult.value : catalogs.series,
    };
    const refreshedAnyCatalog = [liveResult, vodResult, seriesResult].some((result) => result.status === "fulfilled");
    if (!refreshedAnyCatalog) {
      const firstFailure = [liveResult, vodResult, seriesResult].find((result) => result.status === "rejected");
      throw (firstFailure?.status === "rejected" ? firstFailure.reason : new Error("Não foi possível atualizar o catálogo."));
    }
    persistCatalogs(nextCatalogs);
    if (!items.length && nextCatalogs.live.length) setItems(nextCatalogs.live);
    return nextCatalogs;
  }

  async function rotateFeaturedMovie(movies: PlayableItem[]) {
    const current = await AsyncStorage.getItem(FEATURED_MOVIE_KEY);
    let currentId = "";
    if (current) {
      try { currentId = (JSON.parse(current) as PlayableItem).id; } catch { /* cache inválido será substituído abaixo */ }
    }
    const next = movies.find((movie) => movie.id !== currentId) ?? movies[0] ?? null;
    setFeaturedMovie(next);
    if (next) await AsyncStorage.setItem(FEATURED_MOVIE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(FEATURED_MOVIE_KEY);
  }

  async function refreshCatalogIfDue(account: XtreamCredentials, force = false) {
    if (syncingRef.current) return;
    const storedLastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const parsedLastSync = Number(storedLastSync || 0);
    setLastSyncAt(parsedLastSync);
    if (!force && parsedLastSync > 0 && Date.now() - parsedLastSync < DAILY_SYNC_MS) return;
    syncingRef.current = true;
    setLoading(true);
    try {
      const nextCatalogs = await loadAllCatalogs(account, true);
      await rotateFeaturedMovie(nextCatalogs.vod);
      const now = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now));
      setLastSyncAt(now);
      if (view === "vod" || view === "series") setItems(nextCatalogs[view]);
      if (view === "live" && !categoryId) setItems(nextCatalogs.live);
    } catch (cause) {
      if (!catalogs.live.length && !catalogs.vod.length && !catalogs.series.length) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o catálogo.");
    } finally {
      syncingRef.current = false;
      setLoading(false);
    }
  }

  async function loadTab(nextTab: ContentKind, account = credentials) {
    if (!account) return;
    setLoading(true);
    setError("");
    setTab(nextTab);
    setCategoryId("");
    setItems([]);
    setSearch("");
    setScreenTitle(nextTab === "live" ? "Canais ao vivo" : nextTab === "vod" ? "Filmes" : "Séries");
    try {
      const nextCategories = await getCategories(account, nextTab);
      setCategories([{ id: "", name: "Todos" }, ...nextCategories]);
      const initialItems = await getCatalog(account, nextTab);
      setItems(initialItems);
      persistCatalogs({ [nextTab]: initialItems });
    } catch (cause) {
      setCategories([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar este setor.");
    } finally {
      setLoading(false);
    }
  }

  async function connect() {
    if (!accessConfirmed) {
      setError("Confirme que você tem direito de acessar esta fonte e seu conteúdo.");
      return;
    }
    const account = prepareCredentials(server, username, password);
    setLoading(true);
    setError("");
    try {
      const validatedAccount = await validateAccount(account);
      await persistLogin(validatedAccount, rememberLogin);
      credentialsRef.current = validatedAccount;
      setCredentials(validatedAccount);
      setShowLogin(false);
      await AsyncStorage.removeItem(FEATURED_MOVIE_KEY);
      setFeaturedMovie(null);
      const nextCatalogs = await loadAllCatalogs(validatedAccount);
      await rotateFeaturedMovie(nextCatalogs.vod);
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      await loadTab("live", validatedAccount);
      pressFeedback();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível conectar à conta.");
    } finally {
      setLoading(false);
    }
  }

  async function chooseCategory(id: string) {
    if (!credentials) return;
    setLoading(true);
    setError("");
    setCategoryId(id);
    try {
      const nextItems = await getCatalog(credentials, tab, id);
      setItems(nextItems);
      persistCatalogs({ [tab]: nextItems });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar essa categoria.");
    } finally {
      setLoading(false);
    }
  }

  async function openItem(item: PlayableItem) {
    if (item.kind !== "series") {
      setPlayerState({ queue: [item], index: 0 });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const episodes = await getEpisodes(item.credentials, item);
      setItems(episodes);
      setScreenTitle(item.title);
      setCategories([]);
      if (!episodes.length) setError("Esta série não possui episódios disponíveis na lista.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os episódios.");
    } finally {
      setLoading(false);
    }
  }

  function playSelected(item: PlayableItem) {
    try {
      const source = playbackSource(item);
      if (!source.uri.trim()) throw new Error("Fonte vazia");
      const queue = item.kind === "series"
        ? item.episode
          ? detailEpisodes.filter((entry) => entry.kind === "series" && entry.seriesId === item.seriesId)
          : items.filter((entry) => entry.kind === "series")
        : [item];
      const playableQueue = queue.length ? queue : [item];
      const index = Math.max(0, playableQueue.findIndex((entry) => entry.id === item.id));
      setError("");
      setPlayerState({ queue: playableQueue, index });
    } catch {
      setPlayerState(null);
      setError("Este canal ou conteúdo não está disponível para reprodução agora.");
    }
  }

  async function openDetails(item: PlayableItem) {
    if (item.kind === "live") {
      playSelected(item);
      return;
    }
    setSelectedItem(item);
    setDetailEpisodes([]);
    setSelectedSeason("");
    if (item.kind === "series" && !item.episode) {
      try {
        const episodes = await getEpisodes(item.credentials, item);
        setDetailEpisodes(episodes);
        setSelectedSeason(episodes[0]?.season ?? "");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar os episódios.");
      }
    }
  }

  function startSelected() {
    if (!selectedItem) return;
    const item = selectedItem;
    if (item.kind === "series" && !item.episode) {
      const firstEpisode = detailEpisodes.find((episode) => episode.kind === "series" && episode.seriesId === item.seriesId);
      if (!firstEpisode) {
        setError("Os episódios ainda estão carregando. Tente novamente em instantes.");
        return;
      }
      setSelectedItem(null);
      playSelected(firstEpisode);
      return;
    }
    setSelectedItem(null);
    playSelected(item);
  }

  function disconnect() {
    // Logout explícito sempre encerra a sessão persistida. A restauração só
    // deve ocorrer ao reiniciar quando o usuário ainda não saiu da conta.
    void Promise.all([
      clearPersistedLogin(),
      AsyncStorage.removeItem(REMEMBER_LOGIN_KEY),
      AsyncStorage.removeItem(LAST_SYNC_KEY),
      AsyncStorage.removeItem(FEATURED_MOVIE_KEY),
    ]);
    setServer("");
    setUsername("");
    setPassword("");
    credentialsRef.current = null;
    setCredentials(null);
    setShowLogin(true);
    setItems([]);
    setCatalogs({ live: [], vod: [], series: [] });
    setFavorites([]);
    setContinueItems([]);
    setView("home");
    setSearchOpen(false);
    setSearch("");
    setError("");
    setShowLogin(true);
  }

  const matchesSearch = (item: PlayableItem) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || `${item.title} ${item.description} ${item.group ?? ""}`.toLocaleLowerCase().includes(query);
  };
  const recentMovies = catalogs.vod.filter(matchesSearch).slice(0, 14);
  const recentSeries = catalogs.series.filter(matchesSearch).slice(0, 14);
  const recentlyWatched = continueItems.filter(matchesSearch);
  const activeLegalSection = LEGAL_SECTIONS.find((section) => section.id === legalSection) ?? LEGAL_SECTIONS[0];
  const sectorFavorites = useMemo(() => favorites.filter((item) => item.kind === tab), [favorites, tab]);

  if (showSplash || !bootReady) {
    return <IntroSplash onDone={finishSplash} />;
  }

  if (showOnboarding) {
    return <OnboardingScreen onNext={completeOnboarding} />;
  }

  if (playerState) {
    const activeItem = playerState.queue[playerState.index];
    const saved = continueItems.find((entry) => entry.id === activeItem.id);
    return <Player state={playerState} resumePosition={saved?.position} autoplayNext={preferences.autoplayNext} onProgress={saveProgress} onClose={() => setPlayerState(null)} onNext={() => setPlayerState((current) => current ? { ...current, index: current.index + 1 } : null)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <View style={styles.app}>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            {credentials ? (
              <Pressable onPress={() => setMenuOpen(true)} style={styles.menuButton} accessibilityLabel="Abrir menu de setores">
                <MaterialIcons name="menu" size={25} color="#FFFFFF" />
              </Pressable>
            ) : null}
            <View style={styles.headerBrand}>
              <Image source={require("./icon.png")} style={styles.headerLogo} />
              <Text style={styles.headerBrandName}>VÓRTEX PLAY</Text>
            </View>
          </View>
          {credentials ? (
            <View style={styles.topBarActions}>
              {view === "home" && (searchOpen ? (
                <View style={styles.headerSearchBox}>
                  <MaterialIcons name="search" size={19} color="#AFA7BF" />
                  <TextInput autoFocus value={search} onChangeText={setSearch} placeholder="Buscar filmes" placeholderTextColor="#747181" style={styles.headerSearchInput} returnKeyType="search" />
                  <Pressable onPress={() => { setSearch(""); setSearchOpen(false); }} hitSlop={10} accessibilityLabel="Fechar busca"><MaterialIcons name="close" size={18} color="#CFC9E7" /></Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setSearchOpen(true)} style={styles.headerIconButton} accessibilityLabel="Buscar filmes"><MaterialIcons name="search" size={23} color="#FFFFFF" /></Pressable>
              ))}
              <Pressable onPress={disconnect} style={styles.logoutButton} accessibilityLabel="Sair da conta">
                <MaterialIcons name="logout" size={19} color="#CFC9E7" />
                <Text style={styles.logoutLabel}>Sair</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {credentials ? (
          view === "home" ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.homeContent}>
              {featuredMovie ? (
                <Pressable onPress={() => openDetails(featuredMovie)} style={styles.featuredMovieCard}>
                  {featuredMovie.image ? <Image source={{ uri: featuredMovie.image }} style={styles.featuredMovieImage} /> : <View style={[styles.featuredMovieImage, styles.posterFallback]}><MaterialIcons name="movie" size={44} color="#A78BFA" /></View>}
                  <View style={styles.featuredMovieShade} />
                  <View style={styles.featuredMovieCopy}><Text style={styles.featuredMovieKicker}>DESTAQUE ATUALIZADO</Text><Text style={styles.featuredMovieTitle} numberOfLines={2}>{displayTitle(featuredMovie.title).title}</Text><View style={styles.featuredMoviePlay}><MaterialIcons name="play-arrow" size={18} color="#17131F" /></View></View>
                </Pressable>
              ) : null}
              <CatalogRail title="Filmes recentes" data={recentMovies} onPlay={openDetails} />
              <CatalogRail title="Séries recentes" data={recentSeries} onPlay={openDetails} />
              {preferences.showContinue && recentlyWatched.length > 0 && <CatalogRail title="De onde parei" data={recentlyWatched} onPlay={openDetails} />}
              {!recentMovies.length && !recentSeries.length && !loading ? <Text style={styles.emptyText}>{error || "Nenhum conteúdo disponível na lista."}</Text> : null}
            </ScrollView>
          ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.channelContent}>
            <View style={styles.sectorBar}>
              <Text style={styles.sectorLabel}>SETOR ATUAL</Text>
              <Text style={styles.sectorValue}>{view === "my-list" ? "Minha lista" : TABS.find((entry) => entry.key === tab)?.label ?? "Catálogo"}</Text>
            </View>
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={20} color="#9B97AA" />
              <TextInput value={search} onChangeText={setSearch} placeholder="Buscar neste setor" placeholderTextColor="#747181" style={styles.searchInput} />
            </View>
            {view !== "my-list" && categories.length > 0 && (
              <Pressable onPress={() => setCategorySheetOpen(true)} style={styles.categoryDropdownButton} accessibilityLabel="Abrir categorias">
                <MaterialIcons name="category" size={17} color="#DCCEFF" />
                <Text style={styles.categoryDropdownText}>{categoryId ? (categories.find((category) => category.id === categoryId)?.name ?? "Categoria") : "Categorias"}</Text>
                {categoryId ? <Pressable onPress={() => void chooseCategory("")} hitSlop={10}><MaterialIcons name="close" size={16} color="#F06A9B" /></Pressable> : <MaterialIcons name="keyboard-arrow-down" size={19} color="#A78BFA" />}
              </Pressable>
            )}
            {view === "live" ? <>
              {sectorFavorites.length > 0 && <FavoriteGrid title="Canais favoritos" data={sectorFavorites} onPlay={openDetails} />}
              {liveCategoryGroups.map(([categoryName, categoryItems]) => <CatalogRail key={categoryName} title={categoryName} data={categoryItems.slice(0, visibleCount)} onPlay={openDetails} />)}
              {!liveCategoryGroups.length && !loading ? <Text style={styles.emptyText}>{error || "Nenhum canal disponível nesta lista."}</Text> : null}
            </> : <>
              {view !== "my-list" && sectorFavorites.length > 0 && <FavoriteGrid title={view === "vod" ? "Meus filmes favoritos" : "Minhas séries favoritas"} data={sectorFavorites} onPlay={openDetails} />}
              <FlatList
                data={view === "my-list" ? favorites.slice(0, visibleCount) : displayItems}
                onEndReached={() => { if (visibleCount < filteredItems.length) setVisibleCount((count) => Math.min(count + 20, filteredItems.length)); }}
                onEndReachedThreshold={0.45}
                scrollEnabled={false}
                keyExtractor={(item) => `${item.kind}-${item.id}`}
                numColumns={2}
                contentContainerStyle={styles.catalogGrid}
                columnWrapperStyle={styles.catalogRow}
                ListEmptyComponent={loading ? <SkeletonGrid /> : <Text style={styles.emptyText}>{error || (view === "my-list" ? "Sua lista ainda está vazia." : "Nenhum item disponível neste setor.")}</Text>}
                renderItem={({ item }) => (
                  <Pressable onPress={() => openDetails(item)} style={({ pressed }) => [styles.posterCard, pressed && styles.posterPressed]}>
                    {item.image ? <Image source={{ uri: item.image }} resizeMode={item.kind === "live" ? "contain" : "cover"} style={styles.poster} /> : <View style={[styles.poster, styles.posterFallback, item.kind === "live" && styles.channelFallback]}>{item.kind === "live" ? <Text style={styles.channelMonogram}>{channelMonogram(item.title)}</Text> : <MaterialIcons name="play-circle-outline" size={36} color="#A78BFA" />}</View>}
                    <View style={styles.posterShade} />
                    <QualityBadges labels={displayTitle(item.title).labels} />
                    <View style={styles.posterType}><Text style={styles.posterTypeText}>{item.episode ? "EPISÓDIO" : item.kind === "live" ? "AO VIVO" : item.kind === "vod" ? "FILME" : "SÉRIE"}</Text></View>
                    <Text style={styles.posterTitle} numberOfLines={2}>{displayTitle(item.title).title}</Text>
                  </Pressable>
                )}
              />
            </>}
          </ScrollView>
          )
        ) : (
          <View style={styles.loginPrompt}>
            <VortexMark />
            <Pressable style={styles.primaryButton} onPress={() => setShowLogin(true)}>
              <Text style={styles.primaryButtonLabel}>Conectar minha conta</Text>
              <MaterialIcons name="arrow-forward" size={20} color="#17131F" />
            </Pressable>
          </View>
        )}
        {loading && <View style={styles.loadingInline}><ActivityIndicator color="#A78BFA" size="small" /><Text style={styles.loadingInlineText}>Atualizando catálogo…</Text></View>}
        {credentials && (
          <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {NAV_ITEMS.filter((entry) => entry.key !== "my-list").map((entry) => (
              <Pressable key={entry.key} onPress={() => selectView(entry.key)} style={({ pressed }) => [styles.bottomNavItem, view === entry.key && styles.bottomNavItemActive, pressed && styles.bottomNavPressed]} accessibilityLabel={entry.label}>
                <MaterialIcons name={entry.icon} size={22} color={view === entry.key ? "#FFFFFF" : "#8F899D"} />
                <Text style={[styles.bottomNavLabel, view === entry.key && styles.bottomNavLabelActive]}>{entry.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Modal visible={categorySheetOpen} animationType="slide" transparent onRequestClose={() => setCategorySheetOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setCategorySheetOpen(false)}>
          <Pressable style={styles.categorySheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.categorySheetHandle} />
            <Text style={styles.pickerTitle}>Categorias</Text>
            <Text style={styles.categorySheetHint}>{view === "live" ? "Canais" : view === "vod" ? "Filmes" : "Séries"}</Text>
            <ScrollView style={styles.categoryOptionsScroll} contentContainerStyle={styles.categoryOptionsContent} showsVerticalScrollIndicator nestedScrollEnabled>
              {categories.map((category) => <Pressable key={category.id || "all"} onPress={() => { setCategorySheetOpen(false); void chooseCategory(category.id); }} style={styles.categorySheetOption}><Text style={[styles.categorySheetOptionText, categoryId === category.id && styles.categorySheetOptionTextActive]}>{category.name}</Text>{categoryId === category.id ? <MaterialIcons name="check" size={19} color="#F06A9B" /> : null}</Pressable>)}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={settingsOpen} animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <SafeAreaView style={styles.settingsRoot} edges={["top", "left", "right", "bottom"]}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsHeaderTitle}>Configurações</Text>
            <Pressable onPress={() => setSettingsOpen(false)} style={styles.settingsClose} accessibilityLabel="Fechar configurações"><MaterialIcons name="close" size={22} color="#FFFFFF" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.settingsSection}>REPRODUÇÃO</Text>
            <SettingSwitch icon="play-arrow" label="Mostrar 'Continuar assistindo'" value={preferences.showContinue} onChange={(value) => updatePreferences({ showContinue: value })} />
            <SettingSwitch icon="skip-next" label="Reproduzir próximo episódio" value={preferences.autoplayNext} onChange={(value) => updatePreferences({ autoplayNext: value })} />
            <SettingSwitch icon="memory" label="Aceleração de hardware" value={preferences.hardwareAcceleration} onChange={(value) => updatePreferences({ hardwareAcceleration: value })} />

            <Text style={[styles.settingsSection, styles.settingsSectionGap]}>APARÊNCIA</Text>
            <View style={styles.fixedAppearanceRow}>
              <View style={styles.fixedAppearanceIcon}><MaterialIcons name="palette" size={20} color="#D6C7FF" /></View>
              <View style={styles.fixedAppearanceCopy}>
                <Text style={styles.fixedAppearanceLabel}>Preto Cinema</Text>
                <Text style={styles.fixedAppearanceHint}>Paleta padrão VÓRTEX PLAY</Text>
              </View>
              <Text style={styles.fixedAppearanceValue}>Padrão</Text>
            </View>

            <Text style={[styles.settingsSection, styles.settingsSectionGap]}>IDIOMA & IDIOMAS PREFERIDOS</Text>
            <PreferenceRow label="Idioma do app" value={preferences.appLanguage} onPress={() => setPreferencePicker("appLanguage")} />
            <PreferenceRow label="Áudio preferido" value={preferences.audioLanguage} onPress={() => setPreferencePicker("audioLanguage")} />
            <PreferenceRow label="Legenda preferida" value={preferences.subtitleLanguage} onPress={() => setPreferencePicker("subtitleLanguage")} />
            <Pressable onPress={resetLanguages} style={styles.resetLanguages}><Text style={styles.resetLanguagesText}>Redefinir idiomas preferidos</Text></Pressable>
            <Text style={styles.settingsFooter}>As preferências de áudio e legenda serão aplicadas quando o conteúdo e o player disponibilizarem essas faixas.</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={preferencePicker !== null} animationType="fade" transparent onRequestClose={() => setPreferencePicker(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPreferencePicker(null)}>
          <Pressable style={styles.pickerSheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.pickerTitle}>{preferencePicker === "appLanguage" ? "Idioma do app" : preferencePicker === "audioLanguage" ? "Áudio preferido" : "Legenda preferida"}</Text>
            {(preferencePicker === "appLanguage" ? ["Português · Sistema", "Português", "English", "Español"] : preferencePicker === "audioLanguage" ? ["Português", "Original", "English"] : ["Português", "Original", "Desativado"]).map((option) => (
              <Pressable key={option} onPress={() => { if (preferencePicker) updatePreferences({ [preferencePicker]: option }); setPreferencePicker(null); }} style={styles.pickerOption}><Text style={styles.pickerOptionText}>{option}</Text><MaterialIcons name="check" size={18} color={preferencePicker && preferences[preferencePicker] === option ? "#A78BFA" : "transparent"} /></Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={profileOpen} animationType="slide" onRequestClose={() => setProfileOpen(false)}>
        <SafeAreaView style={styles.profileRoot} edges={["top", "left", "right", "bottom"]}>
          <View style={styles.profileHeader}><Text style={styles.profileHeaderTitle}>Perfil e conta</Text><Pressable onPress={() => setProfileOpen(false)} style={styles.settingsClose} accessibilityLabel="Fechar perfil"><MaterialIcons name="close" size={22} color="#FFFFFF" /></Pressable></View>
          <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileHero}><View style={styles.profileAvatar}><Image source={require("./icon.png")} style={styles.profileAvatarImage} /></View><View style={styles.profileIdentity}><Text style={styles.profileKicker}>PERFIL</Text><TextInput value={profileName} onChangeText={(name) => saveProfile({ name })} style={styles.profileNameInput} placeholder="Nome do usuário" placeholderTextColor="#766F80" /><Text style={styles.profileHint}>Nome exibido neste aparelho</Text></View></View>
            <Pressable onPress={() => pressFeedback()} style={styles.avatarButton}><MaterialIcons name="photo-camera" size={18} color="#DCCEFF" /><Text style={styles.avatarButtonText}>Alterar avatar</Text><Text style={styles.avatarButtonHint}>Logo VÓRTEX PLAY</Text></Pressable>
            <Text style={styles.settingsSection}>GERENCIAMENTO DA ASSINATURA</Text>
            <View style={styles.accountCard}><View style={styles.accountCardIcon}><MaterialIcons name="verified-user" size={21} color="#A78BFA" /></View><View style={styles.accountCardCopy}><Text style={styles.accountCardTitle}>Fonte conectada</Text><Text style={styles.accountCardText}>Plano e renovação são administrados pelo provedor da lista.</Text></View></View>
            <Text style={[styles.settingsSection, styles.settingsSectionGap]}>CONTROLE PARENTAL / SEGURANÇA</Text>
            <Text style={styles.profileLabel}>PIN de segurança</Text><View style={styles.pinRow}><TextInput value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 4))} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="4 dígitos" placeholderTextColor="#766F80" style={styles.pinInput} /><Pressable onPress={savePin} style={styles.pinSave}><Text style={styles.pinSaveText}>Salvar PIN</Text></Pressable></View><Text style={styles.profileHint}>Usado para proteger o perfil e conteúdos restritos neste aparelho.</Text>
            <Text style={[styles.profileLabel, { marginTop: 17 }]}>Filtro de faixa etária</Text><View style={styles.ratingRow}>{["Livre", "10+", "14+", "18+"].map((rating) => <Pressable key={rating} onPress={() => saveProfile({ ageRating: rating })} style={[styles.ratingChip, ageRating === rating && styles.ratingChipActive]}><Text style={[styles.ratingChipText, ageRating === rating && styles.ratingChipTextActive]}>{rating}</Text></Pressable>)}</View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={legalOpen} animationType="slide" onRequestClose={() => setLegalOpen(false)}>
        <SafeAreaView style={styles.legalRoot} edges={["top", "left", "right", "bottom"]}>
          <View style={styles.profileHeader}><Text style={styles.profileHeaderTitle}>Termos e privacidade</Text><Pressable onPress={() => setLegalOpen(false)} style={styles.settingsClose} accessibilityLabel="Fechar termos e privacidade"><MaterialIcons name="close" size={22} color="#FFFFFF" /></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legalTabs}>{LEGAL_SECTIONS.map((section) => <Pressable key={section.id} onPress={() => setLegalSection(section.id)} style={[styles.legalTab, legalSection === section.id && styles.legalTabActive]}><Text style={[styles.legalTabText, legalSection === section.id && styles.legalTabTextActive]}>{section.label}</Text></Pressable>)}</ScrollView>
          <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}><Text style={styles.legalKicker}>INFORMAÇÕES INSTITUCIONAIS</Text><Text style={styles.legalTitle}>{activeLegalSection.title}</Text>{activeLegalSection.paragraphs.map((paragraph, index) => <Text key={`${activeLegalSection.id}-${index}`} style={styles.legalParagraph}>{paragraph}</Text>)}<View style={styles.legalNotice}><MaterialIcons name="info-outline" size={18} color="#A78BFA" /><Text style={styles.legalNoticeText}>Esta área é informativa. O responsável pela operação deve revisar o texto, inserir contatos oficiais e confirmar autorizações antes da publicação.</Text></View></ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={selectedItem !== null} animationType={selectedItem?.kind === "series" ? "slide" : "fade"} transparent={selectedItem?.kind !== "series"} presentationStyle={selectedItem?.kind === "series" ? "fullScreen" : "overFullScreen"} onRequestClose={() => setSelectedItem(null)}>
        {selectedItem ? (
          <Pressable style={selectedItem.kind === "series" ? styles.seriesDetailsScreen : styles.detailBackdrop} onPress={() => setSelectedItem(null)}>
            <Pressable style={selectedItem.kind === "series" ? styles.seriesDetailsPanel : styles.detailSheet} onPress={(event) => event.stopPropagation()}>
              <View style={styles.detailTopBar}><Pressable onPress={() => setSelectedItem(null)} style={styles.detailBack}><MaterialIcons name="arrow-back" size={22} color="#FFFFFF" /></Pressable><Text style={styles.detailTopBarTitle}>Assistir</Text></View>
              {selectedItem.image ? <Image source={{ uri: selectedItem.image }} style={styles.detailImage} /> : <View style={[styles.detailImage, styles.posterFallback]}><MaterialIcons name="play-circle-outline" size={48} color="#A78BFA" /></View>}
              <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.detailType}>{selectedItem.episode ? "EPISÓDIO" : selectedItem.kind === "vod" ? "FILME" : "SÉRIE"}</Text>
                <Text style={styles.detailTitle}>{selectedItem.title}</Text>
                <View style={styles.detailMeta}><Text style={styles.detailMetaText}>{selectedItem.season ? `T${selectedItem.season}` : selectedItem.kind === "vod" ? "Filme" : "Série"}</Text><Text style={styles.detailMetaDot}>•</Text><Text style={styles.detailMetaText}>{selectedItem.group || "Catálogo conectado"}</Text></View>
                <Text style={styles.detailDescription}>{selectedItem.description || "Conteúdo disponível na sua lista conectada."}</Text>
                <View style={styles.detailActions}>
                  <Pressable style={[styles.heroPrimary, selectedItem.kind === "series" && !selectedItem.episode && !detailEpisodes.length && styles.heroPrimaryDisabled]} onPress={startSelected} disabled={selectedItem.kind === "series" && !selectedItem.episode && !detailEpisodes.length}><MaterialIcons name="play-arrow" size={20} color="#17131F" /><Text style={styles.heroPrimaryText}>{selectedItem.kind === "series" && !selectedItem.episode && !detailEpisodes.length ? "Carregando" : "Assistir"}</Text></Pressable>
                  <Pressable style={styles.heroSecondary} onPress={() => toggleFavorite(selectedItem)}><MaterialIcons name={favorites.some((entry) => entry.id === selectedItem.id) ? "favorite" : "bookmark-add"} size={19} color="#FFFFFF" /><Text style={styles.heroSecondaryText}>Minha lista</Text></Pressable>
                </View>
                {selectedItem.kind === "series" && !selectedItem.episode && detailEpisodes.length > 0 ? (
                  <>
                    <Text style={styles.episodeHeading}>Episódios</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonRail}>
                      {[...new Set(detailEpisodes.map((episode) => episode.season).filter(Boolean))].map((season) => <Pressable key={season} onPress={() => setSelectedSeason(season ?? "")} style={[styles.seasonChip, selectedSeason === season && styles.seasonChipActive]}><Text style={[styles.seasonChipText, selectedSeason === season && styles.seasonChipTextActive]}>T{season} ({detailEpisodes.filter((episode) => episode.season === season).length} ep)</Text></Pressable>)}
                    </ScrollView>
                    <View style={styles.episodeList}>
                      {detailEpisodes.filter((episode) => !selectedSeason || episode.season === selectedSeason).map((episode) => <Pressable key={episode.id} onPress={() => { setSelectedItem(null); playSelected(episode); }} style={styles.episodeCard}><View style={styles.episodeThumb}>{episode.image ? <Image source={{ uri: episode.image }} style={styles.episodeThumbImage} /> : <MaterialIcons name="movie" size={22} color="#A78BFA" />}</View><View style={styles.episodeCopy}><Text style={styles.episodeCode}>T{episode.season} E{episode.episode}</Text><Text style={styles.episodeTitle} numberOfLines={2}>{episode.title.replace(/^T\d+ E\d+\s*·\s*/, "")}</Text></View><View style={styles.episodePlay}><MaterialIcons name="play-arrow" size={19} color="#17131F" /></View></Pressable>)}
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        ) : null}
      </Modal>

      <Modal visible={menuOpen} animationType="fade" transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.drawerBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.drawer} onPress={(event) => event.stopPropagation()}>
            <View style={styles.drawerHeader}>
              <VortexMark compact />
              <Pressable onPress={() => setMenuOpen(false)} style={styles.drawerClose} accessibilityLabel="Fechar menu">
                <MaterialIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={styles.drawerEyebrow}>NAVEGAR</Text>
            <Text style={styles.drawerTitle}>Escolha um setor</Text>
            {NAV_ITEMS.map((entry) => (
              <Pressable
                key={entry.key}
                onPress={() => selectView(entry.key)}
                style={[styles.drawerItem, view === entry.key && styles.drawerItemActive]}
              >
                <MaterialIcons name={entry.icon} size={21} color={view === entry.key ? "#FFFFFF" : "#AAA5B5"} />
                <Text style={[styles.drawerItemText, view === entry.key && styles.drawerItemTextActive]}>{entry.label}</Text>
                {view === entry.key ? <MaterialIcons name="chevron-right" size={20} color="#C9B8FF" /> : null}
              </Pressable>
            ))}
            <View style={styles.drawerDivider} />
            <Pressable onPress={() => { setMenuOpen(false); setSettingsOpen(true); }} style={styles.drawerItem}>
              <MaterialIcons name="settings" size={21} color="#AAA5B5" />
              <Text style={styles.drawerItemText}>Configurações</Text>
              <MaterialIcons name="chevron-right" size={20} color="#7E7889" />
            </Pressable>
            <Pressable onPress={() => { setMenuOpen(false); setProfileOpen(true); }} style={styles.drawerItem}>
              <MaterialIcons name="person-outline" size={21} color="#AAA5B5" />
              <Text style={styles.drawerItemText}>Perfil e conta</Text>
              <MaterialIcons name="chevron-right" size={20} color="#7E7889" />
            </Pressable>
            <Pressable onPress={() => { setMenuOpen(false); setLegalOpen(true); }} style={styles.drawerItem}>
              <MaterialIcons name="gavel" size={21} color="#AAA5B5" />
              <Text style={styles.drawerItemText}>Termos e privacidade</Text>
              <MaterialIcons name="chevron-right" size={20} color="#7E7889" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={bootReady && showLogin} animationType="fade" transparent={false} statusBarTranslucent={false} presentationStyle="fullScreen" onRequestClose={() => credentials ? setShowLogin(false) : undefined}>
        <SafeAreaView style={styles.loginModalRoot} edges={["top", "bottom", "left", "right"]}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.loginKeyboard}>
            <ScrollView contentContainerStyle={styles.loginScreenContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View pointerEvents="none" style={styles.loginSupportWatermark}>
                <Text style={styles.loginSupportWord}>SUPORTE</Text>
                <View style={styles.loginSupportContact}><MaterialIcons name="chat-bubble-outline" size={20} color="#A78BFA" /><Text style={styles.loginSupportNumber}>13 97401-8318</Text></View>
              </View>
              <View style={styles.loginScreen}>
                <View style={styles.loginBrandZone}>
                  <VortexMark />
                  <View style={styles.loginAccentLine} />
                </View>
                <Text style={styles.loginTitle}>Conecte sua conta</Text>
                <Text style={styles.loginHelp}>Entre com seu servidor compatível ou explore a demonstração.</Text>
                <View style={styles.loginModeTabs} accessibilityRole="tablist">
                  {(["server", "m3u"] as const).map((mode) => (
                    <Pressable key={mode} onPress={() => { setLoginMode(mode); setError(""); }} style={[styles.loginModeTab, loginMode === mode && styles.loginModeTabActive]} accessibilityRole="tab" accessibilityState={{ selected: loginMode === mode }}>
                      <Text style={[styles.loginModeTabText, loginMode === mode && styles.loginModeTabTextActive]}>{mode === "server" ? "Servidor" : "Lista M3U"}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.loginFields}>
                  <TextInput value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="next" placeholder={loginMode === "server" ? "Servidor ou código" : "Link completo da lista M3U"} placeholderTextColor="#777184" style={styles.input} accessibilityLabel={loginMode === "server" ? "Servidor ou código" : "Link completo da lista M3U"} />
                  <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} returnKeyType="next" placeholder="Usuário" placeholderTextColor="#777184" style={styles.input} accessibilityLabel="Usuário" />
                  <TextInput value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} secureTextEntry returnKeyType="done" onSubmitEditing={() => void connect()} placeholder="Senha" placeholderTextColor="#777184" style={styles.input} accessibilityLabel="Senha" />
                </View>
                <Pressable onPress={() => setRememberLogin((value) => !value)} style={styles.confirmRow} accessibilityRole="checkbox" accessibilityState={{ checked: rememberLogin }}>
                  <MaterialIcons name={rememberLogin ? "check-box" : "check-box-outline-blank"} size={22} color={rememberLogin ? "#A78BFA" : "#81798E"} />
                  <View style={styles.confirmCopy}>
                    <Text style={styles.confirmText}>Salvar login neste aparelho</Text>
                    <Text style={styles.confirmHint}>Entrar automaticamente quando abrir o app</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => setAccessConfirmed((confirmed) => !confirmed)} style={styles.confirmRow} accessibilityRole="checkbox" accessibilityState={{ checked: accessConfirmed }}>
                  <MaterialIcons name={accessConfirmed ? "check-box" : "check-box-outline-blank"} size={22} color={accessConfirmed ? "#A78BFA" : "#81798E"} />
                  <Text style={styles.confirmText}>Confirmo que tenho direito de acessar esta fonte e seu conteúdo.</Text>
                </Pressable>
                {error ? <Text style={styles.formError}>{error}</Text> : null}
                <Pressable style={[styles.primaryButton, !accessConfirmed && styles.primaryButtonDisabled]} onPress={() => void connect()} disabled={loading || !accessConfirmed}>
                  {loading ? <ActivityIndicator color="#17131F" /> : <><Text style={styles.primaryButtonLabel}>CONECTAR</Text><MaterialIcons name="play-arrow" size={22} color="#17131F" /></>}
                </Pressable>
                <Text style={styles.loginLegalText}>O Vórtex Play é um reprodutor neutro: não hospeda, vende nem distribui mídia de terceiros. Todo conteúdo exibido depende do que você configurar; a demonstração é apenas visual.</Text>
                {credentials ? <Pressable onPress={() => setShowLogin(false)} style={styles.loginCancelButton}><Text style={styles.cancelText}>Cancelar</Text></Pressable> : null}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function IntroSplash({ onDone }: { onDone: () => void }) {
  const fade = useRef(new Animated.Value(1)).current;
  const completedRef = useRef(false);
  const firstFrameRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const player = useVideoPlayer(INTRO_VIDEO_SOURCE, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = false;
    videoPlayer.play();
  });

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    Animated.timing(fade, {
      toValue: 0,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [fade, onDone]);

  const showFallback = useCallback(() => {
    if (completedRef.current) return;
    setVideoFailed(true);
    fallbackTimerRef.current = setTimeout(complete, 400);
  }, [complete]);

  useEffect(() => {
    const endSubscription = player.addListener("playToEnd", complete);
    const statusSubscription = player.addListener("statusChange", ({ status }) => {
      if (status === "error") showFallback();
    });
    fallbackTimerRef.current = setTimeout(() => {
      if (!firstFrameRef.current) showFallback();
    }, 2500);

    return () => {
      endSubscription.remove();
      statusSubscription.remove();
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [complete, player, showFallback]);

  const handleFirstFrame = useCallback(() => {
    firstFrameRef.current = true;
    setVideoReady(true);
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  return (
    <Animated.View style={[styles.splashRoot, { opacity: fade }]}>
      <StatusBar style="light" hidden />
      <VideoView
        player={player}
        style={styles.splashVideo}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
        useExoShutter={false}
        onFirstFrameRender={handleFirstFrame}
      />
      <View pointerEvents="none" style={styles.splashVignette} />
      <View pointerEvents="none" style={styles.splashTopShade} />
      <View pointerEvents="none" style={styles.splashBottomShade} />
      <View style={styles.splashOverlay}>
        <View style={styles.splashHeader}>
          <Image source={require("./icon.png")} style={styles.splashHeaderLogo} />
          <View>
            <Text style={styles.splashHeaderTitle}>VÓRTEX PLAY</Text>
            <Text style={styles.splashHeaderCaption}>ENTRETENIMENTO</Text>
          </View>
        </View>
        <Pressable onPress={complete} style={({ pressed }) => [styles.splashSkip, pressed && styles.splashSkipPressed]} accessibilityRole="button" accessibilityLabel="Pular introdução">
          <Text style={styles.splashSkipText}>PULAR INTRO</Text>
        </Pressable>
        <View style={styles.splashFooter} pointerEvents="none">
          <Text style={styles.splashFooterKicker}>{videoFailed ? "PREPARANDO SUA EXPERIÊNCIA" : "SEU ENTRETENIMENTO, DO SEU JEITO"}</Text>
          <Text style={styles.splashFooterTitle}>Filmes, séries e TV ao vivo</Text>
          <View style={styles.splashLoadingBadge}>
            <ActivityIndicator size="small" color="#C4B5FD" />
            <Text style={styles.splashLoadingText}>{videoReady ? "Carregando seu catálogo" : "Carregando intro"}</Text>
          </View>
        </View>
        {videoFailed ? (
          <View style={styles.splashFallback} pointerEvents="none">
            <Image source={require("./icon.png")} style={styles.splashFallbackLogo} />
            <Text style={styles.splashFallbackText}>VÓRTEX PLAY</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export default function App() {
  return <SafeAreaProvider><AppScreen /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  splashRoot: { flex: 1, backgroundColor: "#000000", overflow: "hidden" },
  splashVideo: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#000000" },
  splashVignette: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(4, 2, 12, 0.2)" },
  splashTopShade: { position: "absolute", top: 0, left: 0, right: 0, height: 190, backgroundColor: "rgba(5, 2, 18, 0.46)" },
  splashBottomShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 260, backgroundColor: "rgba(5, 2, 18, 0.78)" },
  splashOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 50, paddingBottom: 38 },
  splashHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  splashHeaderLogo: { width: 43, height: 43, borderRadius: 13 },
  splashHeaderTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", letterSpacing: 0.8 },
  splashHeaderCaption: { color: "#C4B5FD", fontSize: 8, fontWeight: "800", letterSpacing: 2.2, marginTop: 2 },
  splashSkip: { position: "absolute", top: 51, right: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "rgba(12, 7, 28, 0.38)" },
  splashSkipPressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  splashSkipText: { color: "#F2EEFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  splashFooter: { alignItems: "flex-start" },
  splashFooterKicker: { color: "#C4B5FD", fontSize: 10, fontWeight: "900", letterSpacing: 1.8, marginBottom: 8 },
  splashFooterTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.48)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 7 },
  splashLoadingBadge: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(196,181,253,0.24)", borderRadius: 999, backgroundColor: "rgba(13, 8, 31, 0.55)" },
  splashLoadingText: { color: "#E7E1F5", fontSize: 11, fontWeight: "700" },
  splashFallback: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#080612" },
  splashFallbackLogo: { width: 82, height: 82, borderRadius: 23, marginBottom: 14 },
  splashFallbackText: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", letterSpacing: 1.7 },
  splashStage: { width: 360, height: 360, alignItems: "center", justifyContent: "center", position: "relative" },
  splashRearGlow: { position: "absolute", width: 290, height: 150, borderRadius: 145, backgroundColor: "rgba(139,92,246,0.42)", shadowColor: "#A855F7", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.95, shadowRadius: 55, elevation: 18 },
  splashCoreGlow: { position: "absolute", width: 205, height: 96, borderRadius: 100, backgroundColor: "rgba(192,132,252,0.4)", shadowColor: "#C084FC", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 30, elevation: 12 },
  splashParticleLayer: { position: "absolute", width: 360, height: 360, left: 0, top: 0 },
  splashParticleLayerSoft: { opacity: 0.82 },
  splashParticleLayerFine: { opacity: 0.72 },
  splashTitle: { color: "#F2F2F5", fontSize: 29, fontWeight: "900", letterSpacing: 2.1, textShadowColor: "rgba(255,255,255,0.68)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  splashBrand: { alignItems: "center", justifyContent: "center", position: "relative" },
  splashGlow: { position: "absolute", width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(168,85,247,0.28)" },
  splashVortex: { position: "absolute", alignItems: "center", justifyContent: "center", borderRadius: 180 },
  splashVortexOuter: { width: 286, height: 286, borderWidth: 17, borderColor: "rgba(124,58,237,0.16)", borderTopColor: "rgba(232,121,249,0.94)", borderRightColor: "rgba(167,139,250,0.7)" },
  splashVortexInner: { width: 218, height: 218, borderWidth: 12, borderColor: "rgba(124,58,237,0.2)", borderBottomColor: "rgba(232,121,249,0.94)", borderLeftColor: "rgba(167,139,250,0.76)" },
  splashVortexCut: { width: 196, height: 196, borderRadius: 98, borderWidth: 2, borderColor: "rgba(255,255,255,0.08)", borderLeftColor: "transparent", borderBottomColor: "rgba(232,121,249,0.5)" },
  splashVortexCutInner: { width: 146, height: 146, borderRadius: 73, borderWidth: 2, borderColor: "rgba(255,255,255,0.1)", borderTopColor: "transparent", borderRightColor: "rgba(167,139,250,0.72)" },
  splashOrb: { width: 190, height: 190, alignItems: "center", justifyContent: "center", position: "relative" },
  splashLogo: { width: 92, height: 92, borderRadius: 23 },
  splashCaption: { color: "#A78BFA", fontSize: 9, fontWeight: "800", letterSpacing: 3.2, marginTop: 6 },
  onboardingRoot: { flex: 1, backgroundColor: "#080612" },
  onboardingContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, paddingVertical: 40 },
  onboardingGlow: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(124,58,237,0.15)" },
  onboardingBrand: { alignItems: "center", marginBottom: 44 },
  onboardingLogo: { width: 94, height: 94, borderRadius: 26, marginBottom: 16 },
  onboardingBrandName: { color: "#E8E8EE", fontSize: 20, fontWeight: "900", letterSpacing: 1.8, textShadowColor: "rgba(183,115,255,0.75)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  onboardingCopy: { width: "100%", alignItems: "center", marginBottom: 34 },
  onboardingTitle: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", textAlign: "center", letterSpacing: -0.4 },
  onboardingSubtitle: { color: "#C0BACB", fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 12, maxWidth: 340 },
  onboardingNext: { width: "100%", maxWidth: 360, height: 54, borderRadius: 17, backgroundColor: "#8B5CF6", alignItems: "center", justifyContent: "center", shadowColor: "#A78BFA", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 14, elevation: 7 },
  onboardingNextPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  onboardingNextText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", letterSpacing: 1.6 },
  safeArea: { flex: 1, backgroundColor: "#0D0D11" },
  app: { flex: 1, backgroundColor: "#0D0D11" },
  bottomNav: { minHeight: 70, backgroundColor: "#14121A", borderTopWidth: 1, borderTopColor: "#2A2634", flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: 8, paddingTop: 7 },
  bottomNavItem: { minWidth: 72, minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, gap: 3 },
  bottomNavItemActive: { backgroundColor: "#3B246B" },
  bottomNavPressed: { opacity: 0.68, transform: [{ scale: 0.97 }] },
  bottomNavLabel: { color: "#8F899D", fontSize: 10, fontWeight: "700" },
  bottomNavLabelActive: { color: "#FFFFFF", fontWeight: "900" },
  topBar: { height: 68, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#24222C", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 },
  menuButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#1C1925", borderWidth: 1, borderColor: "#332C45", alignItems: "center", justifyContent: "center" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  headerLogo: { width: 37, height: 37, borderRadius: 11 },
  headerBrandName: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  headerIconButton: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  headerSearchBox: { height: 42, width: 196, borderRadius: 13, borderWidth: 1, borderColor: "#473565", backgroundColor: "#1C1925", flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 7 },
  headerSearchInput: { flex: 1, color: "#FFFFFF", fontSize: 13, paddingVertical: 0 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 62, height: 62, borderRadius: 16 },
  markSmall: { width: 42, height: 42, borderRadius: 12 },
  wordmark: { color: "#FFFFFF", fontWeight: "800", fontSize: 17, letterSpacing: 0.4 },
  wordmarkCaption: { color: "#A78BFA", fontSize: 8, letterSpacing: 2, marginTop: 2 },
  logoutButton: { flexDirection: "row", alignItems: "center", gap: 6, padding: 9 },
  logoutLabel: { color: "#CFC9E7", fontWeight: "700" },
  pageHeader: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 18 },
  eyebrow: { color: "#A78BFA", fontSize: 11, fontWeight: "800", letterSpacing: 1.8, marginBottom: 8 },
  heading: { color: "#FFFFFF", fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.5 },
  subheading: { color: "#A7A3B3", marginTop: 7, fontSize: 14, lineHeight: 20 },
  homeContent: { paddingBottom: 112, paddingTop: 14 },
  channelContent: { paddingBottom: 34 },
  settingsRoot: { flex: 1, backgroundColor: "#0D0D11" },
  settingsHeader: { height: 70, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#292530", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  settingsHeaderTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  settingsClose: { position: "absolute", right: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: "#211C2D", alignItems: "center", justifyContent: "center" },
  settingsContent: { padding: 20, paddingBottom: 42 },
  settingsSection: { color: "#A78BFA", fontSize: 10, fontWeight: "900", letterSpacing: 1.7, marginBottom: 11 },
  settingsSectionGap: { marginTop: 28 },
  settingRow: { minHeight: 62, borderBottomWidth: 1, borderBottomColor: "#24212B", flexDirection: "row", alignItems: "center", gap: 11 },
  settingIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#211C2D", alignItems: "center", justifyContent: "center" },
  settingLabel: { color: "#F4F0FF", flex: 1, fontSize: 14, fontWeight: "700" },
  settingsSubsection: { color: "#BEB6CB", fontSize: 12, fontWeight: "800", marginTop: 3, marginBottom: 10 },
  fixedAppearanceRow: { minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: "#332C45", backgroundColor: "#17151D", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 11 },
  fixedAppearanceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#211C2D", alignItems: "center", justifyContent: "center" },
  fixedAppearanceCopy: { flex: 1 },
  fixedAppearanceLabel: { color: "#F4F0FF", fontSize: 13, fontWeight: "800" },
  fixedAppearanceHint: { color: "#81798E", fontSize: 10, marginTop: 4 },
  fixedAppearanceValue: { color: "#A78BFA", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  preferenceRow: { minHeight: 58, borderBottomWidth: 1, borderBottomColor: "#24212B", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  preferenceLabel: { color: "#F4F0FF", fontSize: 13, fontWeight: "800" },
  preferenceValue: { color: "#91899D", fontSize: 11, marginTop: 3 },
  resetLanguages: { paddingVertical: 18 },
  resetLanguagesText: { color: "#F06A9B", fontSize: 13, fontWeight: "900" },
  settingsFooter: { color: "#7F788D", fontSize: 11, lineHeight: 17 },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  pickerSheet: { backgroundColor: "#17131F", padding: 20, paddingBottom: 28, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: "#44305F" },
  pickerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginBottom: 12 },
  pickerOption: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: "#2B2634", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerOptionText: { color: "#E5DEEF", fontSize: 14, fontWeight: "700" },
  profileRoot: { flex: 1, backgroundColor: "#0D0D11" },
  profileHeader: { height: 70, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#292530", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  profileHeaderTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  profileContent: { padding: 20, paddingBottom: 42 },
  profileHero: { flexDirection: "row", alignItems: "center", gap: 15, marginBottom: 15 },
  profileAvatar: { width: 76, height: 76, borderRadius: 24, backgroundColor: "#30244A", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 2, borderColor: "#8C65E8" },
  profileAvatarImage: { width: 64, height: 64, borderRadius: 18 },
  profileIdentity: { flex: 1 },
  profileKicker: { color: "#A78BFA", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  profileNameInput: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", paddingVertical: 0 },
  profileHint: { color: "#81798E", fontSize: 10, marginTop: 5 },
  avatarButton: { minHeight: 50, borderRadius: 14, backgroundColor: "#1A1720", borderWidth: 1, borderColor: "#332C45", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 9, marginBottom: 28 },
  avatarButtonText: { color: "#DCCEFF", fontSize: 13, fontWeight: "800" },
  avatarButtonHint: { color: "#81798E", fontSize: 10, marginLeft: "auto" },
  accountCard: { borderRadius: 16, backgroundColor: "#191622", borderWidth: 1, borderColor: "#342B49", padding: 15, flexDirection: "row", gap: 12 },
  accountCardIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#2D2148", alignItems: "center", justifyContent: "center" },
  accountCardCopy: { flex: 1 },
  accountCardTitle: { color: "#F7F1FF", fontSize: 14, fontWeight: "900" },
  accountCardText: { color: "#9991A8", fontSize: 11, lineHeight: 16, marginTop: 5 },
  profileLabel: { color: "#DAD2E6", fontSize: 12, fontWeight: "800", marginBottom: 8 },
  pinRow: { flexDirection: "row", gap: 9 },
  pinInput: { flex: 1, height: 46, borderRadius: 12, backgroundColor: "#1A1720", borderWidth: 1, borderColor: "#332C45", color: "#FFFFFF", paddingHorizontal: 14, letterSpacing: 5 },
  pinSave: { minWidth: 94, height: 46, borderRadius: 12, backgroundColor: "#F06A9B", alignItems: "center", justifyContent: "center" },
  pinSaveText: { color: "#271522", fontSize: 12, fontWeight: "900" },
  ratingRow: { flexDirection: "row", gap: 9 },
  ratingChip: { minWidth: 56, height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: "#40384C", backgroundColor: "#211C2A", alignItems: "center", justifyContent: "center" },
  ratingChipActive: { borderColor: "#F06A9B", backgroundColor: "#F06A9B" },
  ratingChipText: { color: "#BEB5CC", fontSize: 12, fontWeight: "800" },
  ratingChipTextActive: { color: "#241522" },
  legalRoot: { flex: 1, backgroundColor: "#0D0D11" },
  legalTabs: { gap: 8, padding: 16, paddingBottom: 4 },
  legalTab: { minHeight: 37, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: "#40384C", backgroundColor: "#211C2A", alignItems: "center", justifyContent: "center" },
  legalTabActive: { borderColor: "#A78BFA", backgroundColor: "#3B246B" },
  legalTabText: { color: "#BEB5CC", fontSize: 11, fontWeight: "800" },
  legalTabTextActive: { color: "#FFFFFF" },
  legalContent: { padding: 20, paddingTop: 16, paddingBottom: 42 },
  legalKicker: { color: "#A78BFA", fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginBottom: 9 },
  legalTitle: { color: "#FFFFFF", fontSize: 24, lineHeight: 29, fontWeight: "900", marginBottom: 15 },
  legalParagraph: { color: "#C7C0D0", fontSize: 13, lineHeight: 20, marginBottom: 16 },
  legalNotice: { borderRadius: 14, backgroundColor: "#211C2A", borderWidth: 1, borderColor: "#44305F", padding: 13, flexDirection: "row", gap: 9 },
  legalNoticeText: { color: "#AEA5BB", flex: 1, fontSize: 11, lineHeight: 16 },
  detailBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  seriesDetailsScreen: { flex: 1, backgroundColor: "#0D0D11" },
  seriesDetailsPanel: { flex: 1, backgroundColor: "#17131F" },
  detailSheet: { backgroundColor: "#17131F", borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: "#44305F" },
  detailTopBar: { height: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#17131F" },
  detailBack: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#2A2237", alignItems: "center", justifyContent: "center" },
  detailTopBarTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  detailImage: { width: "100%", height: 220, backgroundColor: "#251D35" },
  detailContent: { padding: 20, paddingBottom: 34 },
  detailMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  detailMetaText: { color: "#B6AFC2", fontSize: 12, fontWeight: "700" },
  detailMetaDot: { color: "#6F6680" },
  episodeHeading: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginTop: 24, marginBottom: 10 },
  seasonRail: { gap: 8, paddingBottom: 13 },
  seasonChip: { minHeight: 36, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: "#40384C", backgroundColor: "#211C2A", alignItems: "center", justifyContent: "center" },
  seasonChipActive: { backgroundColor: "#F06A9B", borderColor: "#F06A9B" },
  seasonChipText: { color: "#BEB5CC", fontSize: 11, fontWeight: "800" },
  seasonChipTextActive: { color: "#241522" },
  episodeList: { gap: 9 },
  episodeCard: { minHeight: 74, borderRadius: 14, backgroundColor: "#211D28", borderWidth: 1, borderColor: "#302A38", padding: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  episodeThumb: { width: 86, height: 56, borderRadius: 9, backgroundColor: "#312741", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  episodeThumbImage: { width: "100%", height: "100%" },
  episodeCopy: { flex: 1 },
  episodeCode: { color: "#A78BFA", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  episodeTitle: { color: "#F3EFF8", fontSize: 12, lineHeight: 16, fontWeight: "800", marginTop: 3 },
  episodePlay: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F06A9B", alignItems: "center", justifyContent: "center" },
  detailType: { color: "#A78BFA", fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginBottom: 7 },
  detailTitle: { color: "#FFFFFF", fontSize: 25, lineHeight: 30, fontWeight: "900" },
  detailDescription: { color: "#C5BECE", fontSize: 13, lineHeight: 19, marginTop: 10 },
  detailActions: { flexDirection: "row", gap: 10, marginTop: 18, paddingBottom: 6 },
  featuredMovieCard: { marginHorizontal: 16, height: 260, borderRadius: 22, overflow: "hidden", backgroundColor: "#211A31", position: "relative", borderWidth: 1, borderColor: "#41315D" },
  featuredMovieImage: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  featuredMovieShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(12,10,18,0.5)" },
  featuredMovieCopy: { position: "absolute", left: 18, right: 18, bottom: 17 },
  featuredMovieKicker: { color: "#D4C4FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 6 },
  featuredMovieTitle: { color: "#FFFFFF", fontSize: 24, lineHeight: 29, fontWeight: "900", maxWidth: 280 },
  featuredMoviePlay: { position: "absolute", right: 0, bottom: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: "#A78BFA", alignItems: "center", justifyContent: "center" },
  heroImage: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(12,10,18,0.62)" },
  heroCopy: { position: "absolute", left: 20, right: 20, bottom: 20 },
  heroEyebrow: { color: "#D4C4FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginBottom: 9 },
  heroTitle: { color: "#FFFFFF", fontSize: 28, lineHeight: 32, fontWeight: "900", maxWidth: 290 },
  heroDescription: { color: "#E2DDEA", fontSize: 12, lineHeight: 17, marginTop: 7, maxWidth: 300 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 15 },
  heroPrimary: { height: 40, paddingHorizontal: 15, borderRadius: 12, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 5 },
  heroPrimaryDisabled: { opacity: 0.55 },
  heroPrimaryText: { color: "#17131F", fontSize: 12, fontWeight: "900" },
  heroSecondary: { height: 40, paddingHorizontal: 13, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", flexDirection: "row", alignItems: "center", gap: 5 },
  heroSecondaryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  railSection: { marginTop: 24 },
  railHeading: { paddingHorizontal: 20, flexDirection: "row", alignItems: "baseline", gap: 9, marginBottom: 11 },
  railTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  railCount: { color: "#847D93", fontSize: 11, fontWeight: "700" },
  railList: { paddingHorizontal: 20, gap: 12 },
  railCard: { width: 132, height: 190, borderRadius: 13, overflow: "hidden", backgroundColor: "#1B1821", position: "relative" },
  railPoster: { width: "100%", height: "100%", position: "absolute" },
  channelFallback: { backgroundColor: "#241B35", alignItems: "center", justifyContent: "center" },
  channelMonogram: { color: "#D9C9FF", fontSize: 25, fontWeight: "900", letterSpacing: 1.2 },
  railPosterShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.2)" },
  qualityBadges: { position: "absolute", top: 8, left: 8, zIndex: 2, flexDirection: "row", gap: 4 },
  qualityBadge: { minWidth: 25, height: 20, paddingHorizontal: 5, borderRadius: 6, backgroundColor: "rgba(240,106,155,0.92)", alignItems: "center", justifyContent: "center" },
  qualityBadgeText: { color: "#251521", fontSize: 9, fontWeight: "900" },
  railCardTitle: { position: "absolute", left: 9, right: 9, bottom: 9, color: "#FFFFFF", fontSize: 12, lineHeight: 15, fontWeight: "800" },
  sectorBar: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, flexDirection: "row", alignItems: "baseline", gap: 9 },
  sectorLabel: { color: "#7F788F", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  sectorValue: { color: "#EDE9FE", fontSize: 14, fontWeight: "800" },
  searchBox: { marginHorizontal: 20, marginBottom: 16, height: 46, borderWidth: 1, borderColor: "#2A2832", borderRadius: 14, backgroundColor: "#17161D", alignItems: "center", flexDirection: "row", paddingHorizontal: 13, gap: 8 },
  searchInput: { color: "#F7F5FF", flex: 1, height: "100%", fontSize: 14 },
  categoryRail: { paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  categoryDropdownButton: { alignSelf: "flex-start", marginHorizontal: 20, marginTop: 0, marginBottom: 12, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#1E1B2E", borderWidth: 1, borderColor: "#7651B8", alignItems: "center", flexDirection: "row", gap: 7 },
  categoryDropdownText: { color: "#E8DFFF", fontSize: 12, fontWeight: "900" },
  categorySheet: { maxHeight: "78%", backgroundColor: "#17131F", padding: 20, paddingBottom: 28, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: "#44305F" },
  categoryOptionsScroll: { maxHeight: 430 },
  categoryOptionsContent: { paddingBottom: 8 },
  categorySheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#665A76", alignSelf: "center", marginBottom: 16 },
  categorySheetHint: { color: "#8F879A", fontSize: 11, marginTop: -7, marginBottom: 10 },
  categorySheetOption: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: "#2B2634", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categorySheetOptionText: { color: "#DCD4E7", fontSize: 14, fontWeight: "700" },
  categorySheetOptionTextActive: { color: "#F06A9B", fontWeight: "900" },
  skeletonGrid: { paddingHorizontal: 20, paddingTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  skeletonCard: { width: "47%", marginBottom: 12 },
  skeletonPoster: { height: 210, borderRadius: 14, backgroundColor: "#211D29" },
  skeletonLine: { width: "72%", height: 12, borderRadius: 6, backgroundColor: "#292333", marginTop: 10 },
  categoryPill: { borderWidth: 1, borderColor: "#2A2832", borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: "#17161D" },
  categoryPillActive: { borderColor: "#A78BFA", backgroundColor: "#28203D" },
  categoryText: { color: "#AAA5B5", fontWeight: "700", fontSize: 12 },
  categoryTextActive: { color: "#FFFFFF" },
  catalogGrid: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 44 },
  favoriteSection: { paddingHorizontal: 20, paddingTop: 12 },
  favoriteGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingTop: 12 },
  catalogRow: { gap: 12 },
  posterCard: { width: "48%", aspectRatio: 0.66, marginBottom: 16, backgroundColor: "#1A1820", borderRadius: 14, overflow: "hidden", position: "relative" },
  posterPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  poster: { width: "100%", height: "100%", position: "absolute" },
  posterFallback: { justifyContent: "center", alignItems: "center" },
  posterShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.28)" },
  posterType: { position: "absolute", left: 9, top: 9, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: "rgba(12,10,16,0.78)" },
  posterTypeText: { color: "#EDE9FE", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  posterTitle: { color: "#FFFFFF", position: "absolute", left: 10, right: 10, bottom: 10, fontSize: 14, lineHeight: 17, fontWeight: "800" },
  emptyText: { color: "#A7A3B3", textAlign: "center", paddingTop: 45, fontSize: 14 },
  loginPrompt: { flex: 1, justifyContent: "center", padding: 28, gap: 28 },
  primaryButton: { height: 52, borderRadius: 15, backgroundColor: "#A78BFA", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  primaryButtonLabel: { color: "#17131F", fontSize: 15, fontWeight: "900" },
  loadingInline: { minHeight: 32, marginHorizontal: 20, marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  loadingInlineText: { color: "#9E96AE", fontSize: 11, fontWeight: "700" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.66)" },
  loginModalRoot: { flex: 1, backgroundColor: "#000000" },
  loginKeyboard: { flex: 1 },
  loginScreenContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 34 },
  loginScreen: { width: "100%", maxWidth: 520, alignSelf: "center", gap: 14 },
  loginBrandZone: { alignItems: "center", marginBottom: 12 },
  loginAccentLine: { width: 48, height: 3, borderRadius: 3, backgroundColor: "#A78BFA", marginTop: 16, opacity: 0.85 },
  loginSupportWatermark: { position: "absolute", top: "38%", left: 0, right: 0, alignItems: "center", opacity: 0.15 },
  loginSupportWord: { color: "#A78BFA", fontSize: 42, fontWeight: "900", letterSpacing: 5 },
  loginSupportContact: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  loginSupportNumber: { color: "#D6C7FF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  loginFields: { gap: 12 },
  loginModeTabs: { flexDirection: "row", backgroundColor: "#12101A", borderRadius: 13, padding: 4, borderWidth: 1, borderColor: "#302844" },
  loginModeTab: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  loginModeTabActive: { backgroundColor: "#3B246B", borderWidth: 1, borderColor: "#8B5CF6" },
  loginModeTabText: { color: "#938C9F", fontSize: 13, fontWeight: "800" },
  loginModeTabTextActive: { color: "#FFFFFF" },
  confirmRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingVertical: 2 },
  confirmCopy: { flex: 1 },
  confirmHint: { color: "#82798F", fontSize: 10, lineHeight: 15, marginTop: 2 },
  confirmText: { color: "#BEB6CB", flex: 1, fontSize: 12, lineHeight: 18 },
  primaryButtonDisabled: { opacity: 0.42 },
  loginLegalText: { color: "#746D7D", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 3 },
  loginCancelButton: { alignItems: "center", paddingVertical: 8 },
  loginTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "800", marginTop: 8 },
  loginHelp: { color: "#AAA5B5", fontSize: 13, lineHeight: 19, marginBottom: 4 },
  input: { height: 51, paddingHorizontal: 14, borderWidth: 1, borderColor: "#332F3C", color: "#FFFFFF", borderRadius: 13, backgroundColor: "#0F0E13", fontSize: 14 },
  formError: { color: "#F9A8D4", fontSize: 13, lineHeight: 18 },
  cancelText: { color: "#C9B8FF", textAlign: "center", marginTop: 6, fontWeight: "700" },
  playerRoot: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  video: { width: "100%", height: "100%" },
  playerTouchSurface: { ...StyleSheet.absoluteFill, zIndex: 1 },
  playerControlsLayer: { ...StyleSheet.absoluteFill, zIndex: 2 },
  playerTopBar: { position: "absolute", left: 0, top: 0, right: 0, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.28)" },
  playerBack: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },
  playerTitleBox: { marginLeft: 12, flex: 1 },
  playerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  playerSubtitle: { color: "#D7CCFF", marginTop: 3, fontSize: 11 },
  playerMeta: { color: "#C3B7D8", marginTop: 4, fontSize: 10 },
  playerProgressPanel: { position: "absolute", left: 18, right: 18, bottom: 105, paddingHorizontal: 2 },
  playerTimeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7 },
  playerTimeText: { color: "#F5F0FF", fontSize: 11, fontWeight: "800" },
  progressTouchArea: { height: 38, justifyContent: "center", position: "relative", paddingHorizontal: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.28)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#F06A9B" },
  progressThumb: { position: "absolute", top: 13, width: 14, height: 14, borderRadius: 7, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#F06A9B", shadowColor: "#F06A9B", shadowOpacity: 0.65, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: 3 },
  customControls: { position: "absolute", bottom: 24, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(15,13,21,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 30, paddingHorizontal: 10, paddingVertical: 8 },
  playerControl: { width: 52, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  playerControlDisabled: { opacity: 0.55 },
  playControl: { width: 58, height: 52, borderRadius: 26, backgroundColor: "#A78BFA" },
  controlLabel: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", marginTop: -4 },
  controlLabelDisabled: { color: "#716B7A" },
  playerError: { position: "absolute", top: "48%", alignSelf: "center", backgroundColor: "rgba(74,18,49,0.94)", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, maxWidth: "90%" },
  playerErrorText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
  playerErrorBack: { marginTop: 10, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.14)" },
  playerErrorBackText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", flexDirection: "row" },
  drawer: { width: "82%", maxWidth: 340, backgroundColor: "#131118", paddingHorizontal: 20, paddingTop: 22, paddingBottom: 30, borderTopRightRadius: 28, borderBottomRightRadius: 28, shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 18, elevation: 16 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 28 },
  drawerClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#211C2D", alignItems: "center", justifyContent: "center" },
  drawerDivider: { height: 1, backgroundColor: "#2B2634", marginVertical: 8 },
  drawerEyebrow: { color: "#A78BFA", fontSize: 10, fontWeight: "900", letterSpacing: 1.6, marginBottom: 8 },
  drawerTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "900", marginBottom: 24 },
  drawerItem: { minHeight: 58, borderRadius: 16, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 13, marginBottom: 10, borderWidth: 1, borderColor: "transparent" },
  drawerItemActive: { backgroundColor: "#3B246B", borderColor: "#8C65E8" },
  drawerItemText: { color: "#AAA5B5", fontSize: 15, fontWeight: "700", flex: 1 },
  drawerItemTextActive: { color: "#FFFFFF", fontWeight: "900" },
});
