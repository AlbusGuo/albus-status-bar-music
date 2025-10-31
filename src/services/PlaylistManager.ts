import { App, TFile } from "obsidian";
import {
	CategoryType,
	MusicTrack,
	PlaybackMode,
	PlaylistManagerEvents,
	PluginSettings,
	TrackMetadata,
} from "../types";
import { isSupportedAudioFile, normalizePath } from "../utils/helpers";
import { MetadataManager } from "./MetadataManager";

export class PlaylistManager {
	private app: App;
	private settings: PluginSettings;
	private settingsRef: () => PluginSettings;
	private metadataManager: MetadataManager;
	private fullPlaylist: MusicTrack[] = [];
	private viewPlaylist: MusicTrack[] = [];
	private currentTrack: MusicTrack | null = null;
	private currentCategory: CategoryType = "all";
	private searchQuery: string = "";
	private playlists: Map<string, MusicTrack[]> = new Map();
	private events: Partial<PlaylistManagerEvents> = {};

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
	 * 加载完整播放列表（新的文件夹结构）
	 */
	async loadFullPlaylist(): Promise<void> {
		// 保存当前用户选择的分类
		const savedCategory = this.currentCategory;
		
		// 清空现有数据
		this.fullPlaylist = [];
		this.playlists.clear();

		// 获取最新的设置
		const currentSettings = this.settingsRef();

		if (!currentSettings.musicFolderPath || currentSettings.musicFolderPath.trim() === "") {
			this.updateView();
			return;
		}

		const musicFolderPath = normalizePath(currentSettings.musicFolderPath);
		
		// 分批处理文件收集，避免阻塞UI
		const allFiles = this.app.vault.getFiles();
		const collectedFiles = new Map<string, TFile>();
		const playlistFolders = new Set<string>();
		const batchSize = 50; // 每批处理50个文件

		for (let i = 0; i < allFiles.length; i += batchSize) {
			const batch = allFiles.slice(i, i + batchSize);
			
			// 处理当前批次
			batch.forEach(file => {
				const isMusicFile = isSupportedAudioFile(file.name);
				if (isMusicFile && file.path.startsWith(musicFolderPath)) {
					collectedFiles.set(file.path, file);
					
					// 检测子文件夹作为歌单
					const relativePath = file.path.substring(musicFolderPath.length);
					const pathParts = relativePath.split('/').filter(part => part);
					
					if (pathParts.length > 1) {
						// 有子文件夹，将第一层子文件夹作为歌单
						const playlistName = pathParts[0];
						playlistFolders.add(playlistName);
					}
				}
			});

			// 每处理一批后稍作延迟，让UI有机会响应
			if (i + batchSize < allFiles.length) {
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}

		// 文件处理完成

		// 创建播放列表项和歌单映射
		const fileArray = Array.from(collectedFiles.values());
		
		this.fullPlaylist = fileArray.map((file, index) => {
			// 从 MetadataManager 获取元数据（封面会延迟加载）
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

			// 将歌曲添加到对应的歌单中
			const relativePath = file.path.substring(musicFolderPath.length);
			const pathParts = relativePath.split('/').filter(part => part);
			
			if (pathParts.length > 1) {
				// 属于子文件夹歌单
				const playlistName = pathParts[0];
				if (!this.playlists.has(playlistName)) {
					this.playlists.set(playlistName, []);
				}
				// 确保不会重复添加同一首歌
				const playlist = this.playlists.get(playlistName)!;
				if (!playlist.some(t => t.path === track.path)) {
					playlist.push(track);
				}
			}
			
			return track;
		});

		// 恢复用户之前选择的分类（如果仍然有效）
		if (savedCategory && savedCategory !== "all" && savedCategory !== "favorite") {
			// 检查之前选择的歌单是否还存在
			if (this.playlists.has(savedCategory)) {
				this.currentCategory = savedCategory;
			} else {
				// 歌单不存在，回退到 "all"
				this.currentCategory = "all";
			}
		} else {
			// 恢复 "all" 或 "favorite" 分类
			this.currentCategory = savedCategory;
		}

		this.updateView();
		this.emit("onPlaylistUpdate", this.viewPlaylist);
		
		// 额外确保UI组件收到元数据更新
		setTimeout(() => {
			// 再次触发更新，确保封面数据正确显示
			this.emit("onPlaylistUpdate", this.viewPlaylist);
		}, 100);
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
			// 重新加载整个音乐库
			await this.loadFullPlaylist();
			
			// 使用 MetadataManager 刷新元数据
			await this.metadataManager.refreshAllMetadata([currentSettings.musicFolderPath]);
			
			// 更新设置对象中的元数据
			const metadataExport = this.metadataManager.exportToSettings();
			currentSettings.metadata = metadataExport.metadata;
			
			// 更新播放列表的元数据
			this.updatePlaylistMetadata();
			
			// 重新更新视图以确保歌单过滤正确
			this.updateView();
			
			// 触发UI更新
			this.emit("onPlaylistUpdate", this.viewPlaylist);
			
		} catch (error) {
			console.error("Failed to refresh music library:", error);
			// 即使刷新失败，也要确保UI有响应
			this.emit("onPlaylistUpdate", this.viewPlaylist);
		}
	}

	/**
	 * 更新视图播放列表
	 */
	private updateView(): void {
		let sourcePlaylist: MusicTrack[] = [];

		switch (this.currentCategory) {
			case "all":
				sourcePlaylist = this.fullPlaylist;
				break;
			case "favorite":
				sourcePlaylist = this.fullPlaylist.filter((track) =>
					this.settings.favorites.includes(track.path)
				);
				break;
			default:
				// 检查是否是歌单名称
				const playlistTracks = this.getPlaylistTracks(this.currentCategory);
				if (playlistTracks.length > 0) {
					sourcePlaylist = playlistTracks;
				} else {
					// 兼容旧的路径方式
					sourcePlaylist = this.fullPlaylist.filter((track) =>
						track.path.startsWith(this.currentCategory)
					);
				}
				break;
		}

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

		if (this.settings.playbackMode === "shuffle") {
			this.viewPlaylist = [...sourcePlaylist].sort(
				() => Math.random() - 0.5
			);
		} else {
			this.viewPlaylist = sourcePlaylist;
		}

		// 如果当前曲目不在新列表中，加载第一首
		if (
			!this.currentTrack ||
			!this.fullPlaylist.some((t) => t.path === this.currentTrack!.path)
		) {
			this.loadTrack(this.viewPlaylist[0], false);
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
	 * 设置分类
	 */
	setCategory(category: CategoryType): void {
		this.currentCategory = category;
		this.updateView();
		this.emit("onPlaylistUpdate", this.viewPlaylist);
		this.emit("onCategoryChange", category);
	}

	/**
	 * 设置搜索查询
	 */
	setSearchQuery(query: string): void {
		this.searchQuery = query.trim().toLowerCase();
		this.updateView();
	}

	/**
	 * 获取所有歌单名称
	 */
	getPlaylists(): string[] {
		return Array.from(this.playlists.keys()).sort();
	}

	/**
	 * 获取指定歌单的曲目
	 */
	getPlaylistTracks(playlistName: string): MusicTrack[] {
		const playlist = this.playlists.get(playlistName);
		return playlist ? [...playlist] : [];
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
	loadTrack(track: MusicTrack | null, autoPlay: boolean = false): void {
		this.currentTrack = track;
		this.emit("onTrackChange", track);
	}

	/**
	 * 播放下一首
	 */
	playNext(): MusicTrack | null {
		if (this.viewPlaylist.length === 0) return null;

		const currentIndex = this.currentTrack
			? this.viewPlaylist.findIndex((t) => t.id === this.currentTrack!.id)
			: -1;

		const nextIndex = (currentIndex + 1) % this.viewPlaylist.length;
		const nextTrack = this.viewPlaylist[nextIndex];

		this.loadTrack(nextTrack, true);
		return nextTrack;
	}

	/**
	 * 播放上一首
	 */
	playPrevious(): MusicTrack | null {
		if (this.viewPlaylist.length === 0) return null;

		const currentIndex = this.currentTrack
			? this.viewPlaylist.findIndex((t) => t.id === this.currentTrack!.id)
			: -1;

		const prevIndex =
			currentIndex === -1
				? this.viewPlaylist.length - 1
				: (currentIndex - 1 + this.viewPlaylist.length) %
				  this.viewPlaylist.length;

		const prevTrack = this.viewPlaylist[prevIndex];

		this.loadTrack(prevTrack, true);
		return prevTrack;
	}

	/**
	 * 切换收藏状态
	 */
	toggleFavorite(track?: MusicTrack): void {
		const targetTrack = track || this.currentTrack;
		if (!targetTrack) return;

		const favIndex = this.settings.favorites.indexOf(targetTrack.path);
		if (favIndex > -1) {
			this.settings.favorites.splice(favIndex, 1);
		} else {
			this.settings.favorites.push(targetTrack.path);
		}

		// 如果当前显示收藏列表，更新视图
		if (this.currentCategory === "favorite") {
			this.updateView();
		}
	}

	/**
	 * 检查是否为收藏
	 */
	isFavorite(track?: MusicTrack): boolean {
		const targetTrack = track || this.currentTrack;
		if (!targetTrack) return false;
		return this.settings.favorites.includes(targetTrack.path);
	}

	/**
	 * 处理文件变化
	 */
	handleFileChange(path: string): void {
		const isInMusicFolder = this.settings.musicFolderPath && 
			path.startsWith(normalizePath(this.settings.musicFolderPath));

		if (isInMusicFolder) {
			// 删除相关元数据缓存
			delete this.settings.metadata[path];

			// 延迟重新加载播放列表
			setTimeout(() => this.loadFullPlaylist(), 500);
		}
	}

	/**
	 * 获取可用分类
	 */
	getCategories(): { value: string; label: string }[] {
		const categories = [
			{ value: "all", label: "所有歌曲" },
			{ value: "favorite", label: "红心歌单" },
		];

		// 添加歌单分类
		const playlists = this.getPlaylists();
		playlists.forEach(playlistName => {
			categories.push({
				value: playlistName,
				label: playlistName,
			});
		});

		return categories;
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
	 * 获取完整播放列表
	 */
	getFullPlaylist(): MusicTrack[] {
		return this.fullPlaylist;
	}

	/**
	 * 获取当前分类
	 */
	getCurrentCategory(): CategoryType {
		return this.currentCategory;
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
		this.emit("onPlaylistUpdate", this.viewPlaylist);
		
		// 元数据缓存已清理
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.metadataManager.cleanup();
	}
}
