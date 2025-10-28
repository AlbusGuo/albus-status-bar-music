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
	private events: Partial<PlaylistManagerEvents> = {};

	constructor(app: App, settings: PluginSettings, settingsRef?: () => PluginSettings) {
		this.app = app;
		this.settings = settings;
		this.settingsRef = settingsRef || (() => settings);
		this.metadataManager = new MetadataManager(app);
		
		// 设置元数据更新回调
		this.metadataManager.setMetadataUpdateCallback((metadata) => {
			// 当元数据更新时，重新构建播放列表
			this.rebuildPlaylistFromMetadata(metadata);
		});
		
		// 初始化元数据管理器
		this.metadataManager.initializeFromSettings(settings);
	}

	/**
	 * 从元数据重建播放列表
	 */
	private rebuildPlaylistFromMetadata(metadata: Map<string, TrackMetadata>): void {
		// 如果当前有播放列表，重新应用元数据
		if (this.fullPlaylist.length > 0) {
			this.fullPlaylist.forEach(track => {
				const trackMetadata = metadata.get(track.path);
				if (trackMetadata) {
					track.metadata = trackMetadata;
				}
			});
			
			// 只有在元数据管理器完全初始化后才更新UI
			if (this.metadataManager.isFullyInitialized()) {
				this.updateView();
				this.emit("onPlaylistUpdate", this.viewPlaylist);
			}
		}
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
	 * 加载完整播放列表（优化版本）
	 */
	async loadFullPlaylist(): Promise<void> {
		this.fullPlaylist = [];

		// 获取最新的设置
		const currentSettings = this.settingsRef();

		const validFolders = currentSettings.musicFolderPaths.filter(
			(p) => p && p.trim() !== ""
		);
		if (validFolders.length === 0) {
			this.updateView();
			return;
		}

		// 分批处理文件收集，避免阻塞UI
		const allFiles = this.app.vault.getFiles();
		const collectedFiles = new Map<string, TFile>();
		const batchSize = 50; // 每批处理50个文件
		let processed = 0;

		for (let i = 0; i < allFiles.length; i += batchSize) {
			const batch = allFiles.slice(i, i + batchSize);
			
			// 处理当前批次
			batch.forEach(file => {
				const isMusicFile = isSupportedAudioFile(file.name);
				if (isMusicFile) {
					const isInValidFolder = validFolders.some(folder => {
						const normalizedPath = normalizePath(folder);
						return file.path.startsWith(normalizedPath);
					});
					
					if (isInValidFolder) {
						collectedFiles.set(file.path, file);
					}
				}
				processed++;
			});

			// 每处理一批后稍作延迟，让UI有机会响应
			if (i + batchSize < allFiles.length) {
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}

		// 文件处理完成

		// 创建播放列表项
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
			
			return {
				id: index,
				name: file.basename,
				path: file.path,
				resourcePath: this.app.vault.getResourcePath(file),
				metadata: metadata,
			};
		});

		this.updateView();
		this.emit("onPlaylistUpdate", this.viewPlaylist);
	}

	/**
	 * 刷新元数据
	 */
	async refreshMetadata(): Promise<void> {
		// 开始元数据刷新
		
		const currentSettings = this.settingsRef();
		const validFolders = currentSettings.musicFolderPaths.filter(
			(p) => p && p.trim() !== ""
		);
		
		if (validFolders.length === 0) {
			// 无有效音乐文件夹
			this.emit("onPlaylistUpdate", []);
			return;
		}

		// 使用 MetadataManager 刷新元数据
		await this.metadataManager.refreshAllMetadata(validFolders);
		
		// 更新设置对象中的元数据
		const metadataExport = this.metadataManager.exportToSettings();
		currentSettings.metadata = metadataExport.metadata;
		
		// 元数据刷新完成
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
				sourcePlaylist = this.fullPlaylist.filter((track) =>
					track.path.startsWith(this.currentCategory)
				);
				break;
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
		const isInMusicFolder = this.settings.musicFolderPaths.some(
			(p) => p && path.startsWith(p)
		);

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
			{ value: "favorite", label: "喜爱列表" },
		];

		const validFolders = this.settings.musicFolderPaths.filter(
			(p) => p && p.trim() !== ""
		);
		if (validFolders.length > 1) {
			validFolders.forEach((path) => {
				categories.push({
					value: path,
					label: path.split("/").pop() || path,
				});
			});
		}

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
