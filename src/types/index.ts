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
}

export interface PluginSettings {
	musicFolderPaths: string[];
	favorites: string[];
	playbackMode: PlaybackMode;
	metadata: Record<string, TrackMetadata>;
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
