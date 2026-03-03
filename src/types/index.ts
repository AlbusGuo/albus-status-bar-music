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
	showControlButtons: boolean;
	closeHubOnClickOutside: boolean;
	volume: number;
	lyricsHighlightColorDark: string;
	lyricsHighlightColorLight: string;
	showLoadNotice: boolean;
}

export type PlaybackMode = "loop" | "single" | "shuffle";

export type CategoryType = "all" | "favorite" | string;

export type LyricsDisplayState = "off" | "statusbar" | "floating";

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

// 歌词相关类型定义
export interface LyricLine {
	time: number;
	text: string;
	translation?: string;
	endTime?: number;
}

export interface ParsedLyrics {
	lines: LyricLine[];
	title?: string;
	artist?: string;
	album?: string;
	offset?: number;
	hasBilingual?: boolean;
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
