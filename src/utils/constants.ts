export const DEFAULT_METADATA = {
	title: "未知标题",
	artist: "未知艺术家",
	album: "未知专辑",
	cover: null,
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
} as const;

export const ICONS = {
	PLAY: "play",
	PAUSE: "pause",
	SKIP_BACK: "skip-back",
	SKIP_FORWARD: "skip-forward",
	HEART: "heart",
	MUSIC: "music",
	REPEAT: "repeat",
	REPEAT_ONE: "repeat-1",
	SHUFFLE: "shuffle",
	LIST: "list",
	TEXT: "type", // 歌词图标
	VOLUME: "volume-2", // 音量图标
	VOLUME_MUTE: "volume-x", // 静音图标
} as const;
