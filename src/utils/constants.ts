export const PLAYBACK_MODES: readonly string[] = [
	"loop",
	"single",
	"shuffle",
] as const;

export const SUPPORTED_AUDIO_FORMATS = [
	"flac",
	"mp3",
	"wav",
	"m4a",
	"ogg",
] as const;

export const DEFAULT_METADATA = {
	title: "未知标题",
	artist: "未知艺术家",
	album: "未知专辑",
	cover: null,
} as const;

export const UI_CONSTANTS = {
	STATUS_BAR_WIDTH: 150,
	STATUS_BAR_HEIGHT: 30,
	BUTTON_SIZE: 30,
	HUB_WIDTH: 300,
	MAX_PLAYLIST_HEIGHT: 300,
	COVER_SIZE: 40,
	PROGRESS_UPDATE_INTERVAL: 100,
	SCROLL_ANIMATION_DURATION: 10000,
} as const;

export const CSS_CLASSES = {
	STATUSBAR: "albus-status-bar-music-statusbar",
	BUTTON: "albus-status-bar-music-button",
	TRACK_BUTTON: "albus-status-bar-music-track-button",
	PROGRESS: "albus-status-bar-progress",
	HUB_CONTAINER: "albus-status-bar-music-hub-container",
	IS_PLAYING: "is-playing",
	IS_SCROLLING: "is-scrolling",
	IS_DRAGGING: "is-dragging",
	IS_FAVORITE: "is-favorite",
	IS_LOADING: "is-loading",
} as const;

export const ICONS = {
	PLAY: "play",
	PAUSE: "pause",
	SKIP_BACK: "skip-back",
	SKIP_FORWARD: "skip-forward",
	HEART: "heart",
	MUSIC: "music",
	REFRESH: "refresh-cw",
	REPEAT: "repeat",
	REPEAT_ONE: "repeat-1",
	SHUFFLE: "shuffle",
	TRASH: "trash",
} as const;
