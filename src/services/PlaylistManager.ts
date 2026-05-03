import { App, TFile, normalizePath } from "obsidian";
import {
	CategoryType,
	MusicTrack,
	PlaybackMode,
	PlaylistManagerEvents,
	PluginSettings,
	TrackMetadata,
} from "../types";
import { collectSupportedAudioFilesFromFolder } from "../utils/helpers";
import { MetadataManager } from "./MetadataManager";

export class PlaylistManager {
	private app: App;
	private settings: PluginSettings;
	private settingsRef: () => PluginSettings;
	private metadataManager: MetadataManager;
	private readonly scanBatchSize: number = 200;
	private fullPlaylist: MusicTrack[] = [];
	private viewPlaylist: MusicTrack[] = [];
	private currentTrack: MusicTrack | null = null;
	private currentFilter: CategoryType = "all";
	private searchQuery: string = "";
	private events: Partial<PlaylistManagerEvents> = {};
	private playHistory: MusicTrack[] = [];

	constructor(app: App, settings: PluginSettings, settingsRef?: () => PluginSettings) {
		this.app = app;
		this.settings = settings;
		this.settingsRef = settingsRef || (() => settings);
		this.metadataManager = new MetadataManager(app);
	}

	/**
	 * 初始化元数据管理器
	 */
	initializeMetadata(settings: PluginSettings): void {
		this.metadataManager.initializeFromSettings(settings);
	}

	/**
	 * 扫描大音乐库时分批让出主线程，减少对 Obsidian 其它工作的阻塞
	 */
	private async yieldToMainThread(): Promise<void> {
		await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
	}

	/**
	 * 更新播放列表的元数据（不重新构建播放列表）
	 */
	private updatePlaylistMetadata(): void {
		this.fullPlaylist.forEach(track => {
			const updatedMetadata = this.metadataManager.getMetadata(track.path);
			if (updatedMetadata) {
				track.metadata = updatedMetadata;
			}
		});
	}

	/**
	 * 注册事件监听器
	 */
	on<K extends keyof PlaylistManagerEvents>(
		event: K,
		callback: PlaylistManagerEvents[K]
	): void {
		this.events[event] = callback;
	}

	/**
	 * 触发事件
	 */
	private emit<K extends keyof PlaylistManagerEvents>(
		event: K,
		...args: Parameters<PlaylistManagerEvents[K]>
	): void {
		const callback = this.events[event];
		if (callback) {
			(callback as any)(...args);
		}
	}

	/**
	 * 加载音乐文件夹内所有音频文件（不递归子文件夹）
	 */
	async loadFullPlaylist(): Promise<void> {
		const savedFilter = this.currentFilter;
		
		this.fullPlaylist = [];

		const currentSettings = this.settingsRef();

		if (!currentSettings.musicFolderPath || currentSettings.musicFolderPath.trim() === "") {
			this.updateView();
			return;
		}

		const musicFolderPath = normalizePath(currentSettings.musicFolderPath);
		const fileArray = collectSupportedAudioFilesFromFolder(
			this.app,
			musicFolderPath
		);

		this.fullPlaylist = [];

		for (let index = 0; index < fileArray.length; index++) {
			const file = fileArray[index];
			const savedMetadata = this.metadataManager.getMetadata(file.path);
			const metadata = savedMetadata || {
				title: file.basename,
				artist: "未知艺术家",
				album: "未知专辑",
				cover: null,
			};
			
			const track = {
				id: index,
				name: file.basename,
				path: file.path,
				resourcePath: this.app.vault.getResourcePath(file),
				metadata: metadata,
			};

			this.fullPlaylist.push(track);

			if ((index + 1) % this.scanBatchSize === 0 && index + 1 < fileArray.length) {
				await this.yieldToMainThread();
			}
		}

		// 恢复之前选择的筛选条件
		if (savedFilter && savedFilter !== "all" && savedFilter !== "favorite") {
			this.currentFilter = savedFilter;
		} else {
			this.currentFilter = savedFilter;
		}

		this.updateView();
	}

	/**
	 * 刷新音乐库和元数据
	 */
	async refreshMetadata(): Promise<void> {
		const currentSettings = this.settingsRef();
		
		if (!currentSettings.musicFolderPath || currentSettings.musicFolderPath.trim() === "") {
			// 无有效音乐文件夹
			this.emit("onPlaylistUpdate", []);
			return;
		}

		try {
			// 使用 MetadataManager 刷新元数据
			await this.metadataManager.refreshAllMetadata([currentSettings.musicFolderPath]);
			
			// 更新设置对象中的元数据
			const metadataExport = this.metadataManager.exportToSettings();
			currentSettings.metadata = metadataExport.metadata;
			
			// 更新播放列表的元数据
			this.updatePlaylistMetadata();
			
			// 同步当前曲目的元数据（currentTrack 可能是旧引用，未被 updatePlaylistMetadata 覆盖）
			if (this.currentTrack) {
				const updatedMetadata = this.metadataManager.getMetadata(this.currentTrack.path);
				if (updatedMetadata) {
					this.currentTrack.metadata = updatedMetadata;
				}
			}
			
			// 重新更新视图以确保歌单过滤正确
			this.updateView();
			
		} catch (error) {
			// 即使刷新失败，也要确保UI有响应
			this.emit("onPlaylistUpdate", this.viewPlaylist);
		}
	}

	/**
	 * 更新视图播放列表（按当前过滤器筛选）
	 */
	private updateView(): void {
		let sourcePlaylist: MusicTrack[] = [];

		sourcePlaylist = this.fullPlaylist.filter((track) => {
			if (this.currentFilter.startsWith("artist:")) {
				const artist = this.currentFilter.substring(7);
				return track.metadata?.artist === artist;
			}
			if (this.currentFilter.startsWith("album:")) {
				const album = this.currentFilter.substring(6);
				return track.metadata?.album === album;
			}
			return true;
		});

		// 应用搜索过滤
		if (this.searchQuery) {
			sourcePlaylist = sourcePlaylist.filter((track) => {
				const title = track.metadata?.title || track.name;
				const artist = track.metadata?.artist || "";
				const album = track.metadata?.album || "";
				
				return (
					title.toLowerCase().includes(this.searchQuery) ||
					artist.toLowerCase().includes(this.searchQuery) ||
					album.toLowerCase().includes(this.searchQuery)
				);
			});
		}

		this.viewPlaylist = sourcePlaylist;

		// 如果当前曲目不在新列表中，尝试恢复上次播放的曲目，否则加载第一首
		if (
			!this.currentTrack ||
			!this.fullPlaylist.some((t) => t.path === this.currentTrack!.path)
		) {
			const currentSettings = this.settingsRef();
			const lastPath = currentSettings.lastPlayedTrackPath;
			const lastTrack = lastPath
				? this.viewPlaylist.find((t) => t.path === lastPath)
				: null;
			this.loadTrack(lastTrack || this.viewPlaylist[0]);
		}

		this.emit("onPlaylistUpdate", this.viewPlaylist);
	}

	/**
	 * 设置播放模式
	 */
	setPlaybackMode(mode: PlaybackMode): void {
		this.settings.playbackMode = mode;
		this.updateView();
		this.emit("onModeChange", mode);
	}

	/**
	 * 设置搜索查询
	 */
	setSearchQuery(query: string): void {
		this.searchQuery = query.trim().toLowerCase();
		this.updateView();
	}

	/**
	 * 获取所有歌手列表
	 */
	getAllArtists(): string[] {
		const artists = new Set<string>();
		for (const track of this.fullPlaylist) {
			const artist = track.metadata?.artist;
			if (artist && artist !== "未知艺术家") {
				artists.add(artist);
			}
		}
		return Array.from(artists).sort();
	}

	/**
	 * 获取所有专辑列表
	 */
	getAllAlbums(): string[] {
		const albums = new Set<string>();
		for (const track of this.fullPlaylist) {
			const album = track.metadata?.album;
			if (album && album !== "未知专辑") {
				albums.add(album);
			}
		}
		return Array.from(albums).sort();
	}

	/**
	 * 获取歌手封面（该歌手第一首有封面的歌曲）
	 */
	getArtistCover(artist: string): string | null {
		for (const track of this.fullPlaylist) {
			if (track.metadata?.artist === artist && track.metadata?.cover) {
				return track.metadata.cover;
			}
		}
		return null;
	}

	/**
	 * 获取专辑封面（该专辑第一首有封面的歌曲）
	 */
	getAlbumCover(album: string): string | null {
		for (const track of this.fullPlaylist) {
			if (track.metadata?.album === album && track.metadata?.cover) {
				return track.metadata.cover;
			}
		}
		return null;
	}

	/**
	 * 按歌手筛选
	 */
	filterByArtist(artist: string): void {
		this.currentFilter = `artist:${artist}`;
		this.updateView();
	}

	/**
	 * 按专辑筛选
	 */
	filterByAlbum(album: string): void {
		this.currentFilter = `album:${album}`;
		this.updateView();
	}

	/**
	 * 显示所有歌曲
	 */
	showAllTracks(): void {
		this.currentFilter = "all";
		this.updateView();
	}

	/**
	 * 获取当前播放列表
	 */
	getPlaylist(): MusicTrack[] {
		return this.viewPlaylist;
	}

	/**
	 * 加载曲目
	 */
	loadTrack(track: MusicTrack | null): void {
		this.currentTrack = track;
		this.emit("onTrackChange", track);
	}

	/**
	 * 播放下一首
	 */
	playNext(): MusicTrack | null {
		if (this.viewPlaylist.length === 0) return null;

		if (this.settings.playbackMode === "shuffle") {
			// 随机模式：真正随机选取，不打乱列表
			if (this.currentTrack) {
				this.playHistory.push(this.currentTrack);
				if (this.playHistory.length > 100) {
					this.playHistory = this.playHistory.slice(-100);
				}
			}
			const candidates = this.viewPlaylist.filter(t => t.id !== this.currentTrack?.id);
			const pool = candidates.length > 0 ? candidates : this.viewPlaylist;
			const randomIndex = Math.floor(Math.random() * pool.length);
			const nextTrack = pool[randomIndex];
			this.loadTrack(nextTrack);
			return nextTrack;
		}

		const currentIndex = this.currentTrack
			? this.viewPlaylist.findIndex((t) => t.id === this.currentTrack!.id)
			: -1;

		const nextIndex = (currentIndex + 1) % this.viewPlaylist.length;
		const nextTrack = this.viewPlaylist[nextIndex];

		this.loadTrack(nextTrack);
		return nextTrack;
	}

	/**
	 * 播放上一首
	 */
	playPrevious(): MusicTrack | null {
		if (this.viewPlaylist.length === 0) return null;

		if (this.settings.playbackMode === "shuffle" && this.playHistory.length > 0) {
			// 随机模式：回退到播放历史中的上一首
			const prevTrack = this.playHistory.pop()!;
			this.loadTrack(prevTrack);
			return prevTrack;
		}

		const currentIndex = this.currentTrack
			? this.viewPlaylist.findIndex((t) => t.id === this.currentTrack!.id)
			: -1;

		const prevIndex =
			currentIndex === -1
				? this.viewPlaylist.length - 1
				: (currentIndex - 1 + this.viewPlaylist.length) %
				  this.viewPlaylist.length;

		const prevTrack = this.viewPlaylist[prevIndex];

		this.loadTrack(prevTrack);
		return prevTrack;
	}

	/**
	 * 处理文件变化
	 */
	handleFileChange(path: string): void {
		const isInMusicFolder = this.settings.musicFolderPath && 
			path.startsWith(normalizePath(this.settings.musicFolderPath));

		if (isInMusicFolder) {
			delete this.settings.metadata[path];
			setTimeout(() => this.loadFullPlaylist(), 500);
		}
	}

	/**
	 * 获取当前筛选标签文本
	 */
	getFilterLabel(): string {
		if (this.currentFilter === "all") return "所有歌曲";
		if (this.currentFilter === "favorite") return "红心歌单";
		if (this.currentFilter.startsWith("artist:")) return this.currentFilter.substring(7);
		if (this.currentFilter.startsWith("album:")) return this.currentFilter.substring(6);
		return "所有歌曲";
	}

	/**
	 * 获取当前分类 (兼容旧接口)
	 */
	getCurrentFilter(): CategoryType {
		return this.currentFilter;
	}

	/**
	 * 获取当前曲目
	 */
	getCurrentTrack(): MusicTrack | null {
		return this.currentTrack;
	}

	/**
	 * 获取视图播放列表
	 */
	getViewPlaylist(): MusicTrack[] {
		return this.viewPlaylist;
	}

	/**
	 * 获取当前分类
	 */
	getCurrentCategory(): CategoryType {
		return this.currentFilter;
	}

	/**
	 * 清空元数据缓存
	 */
	clearMetadataCache(): void {
		this.metadataManager.cleanup();
		
		// 重新初始化空的缓存
		this.metadataManager.initializeFromSettings({ 
			metadata: {} 
		} as PluginSettings);
		
		// 清空播放列表中的元数据
		this.fullPlaylist.forEach(track => {
			track.metadata = {
				title: track.name,
				artist: "未知艺术家",
				album: "未知专辑",
				cover: null
			};
		});
		
		// 更新视图
		this.updateView();
		
		// 元数据缓存已清理
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.metadataManager.cleanup();
	}
}
