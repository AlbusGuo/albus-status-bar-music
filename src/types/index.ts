export interface MusicTrack {
	id: number;
	name: string;
	path: string;
	resourcePath: string;
	metadata: TrackMetadata;
}

export interface TrackMetadata {
	title: string;
	artist: string;
	album: string;
	cover: string | null;
	lyrics?: string | null; // 歌词内容
}

export interface PluginSettings {
	musicFolderPath: string;
	favorites: string[];
	playbackMode: PlaybackMode;
	metadata: Record<string, TrackMetadata>;
	showControlButtons: boolean; // 是否显示状态栏控制按钮
	closeHubOnClickOutside: boolean; // 点击外部是否关闭音乐中心
}

export type PlaybackMode = "loop" | "single" | "shuffle";

export type CategoryType = "all" | "favorite" | string;

export interface AudioPlayerEvents {
	onPlay: () => void;
	onPause: () => void;
	onTimeUpdate: () => void;
	onEnded: () => void;
	onLoadStart: () => void;
	onLoadEnd: () => void;
	onError: (error: Error) => void;
}

export interface PlaylistManagerEvents {
	onTrackChange: (track: MusicTrack | null) => void;
	onPlaylistUpdate: (tracks: MusicTrack[]) => void;
	onModeChange: (mode: PlaybackMode) => void;
	onCategoryChange: (category: CategoryType) => void;
}

export interface ID3v2Header {
	version: number;
	flags: number;
	size: number;
}

export interface ID3v2Frame {
	id: string;
	size: number;
	flags: number;
	data: Uint8Array;
}

// 歌词相关类型定义
export interface LyricLine {
	time: number; // 时间（秒）
	text: string; // 歌词文本
	translation?: string; // 翻译（可选）
}

export interface ParsedLyrics {
	lines: LyricLine[];
	title?: string;
	artist?: string;
	album?: string;
	offset?: number; // 偏移量（毫秒）
}

export interface LyricsDisplayOptions {
	showTranslation: boolean;
	highlightCurrentLine: boolean;
	autoScroll: boolean;
	fontSize: number;
}

export interface LyricsEvents {
	onLyricsLoaded: (lyrics: ParsedLyrics | null) => void;
	onCurrentLineChange: (lineIndex: number) => void;
}
