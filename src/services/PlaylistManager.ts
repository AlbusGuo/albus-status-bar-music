import { App, TFile } from "obsidian";
import {
	CategoryType,
	MusicTrack,
	PlaybackMode,
	PlaylistManagerEvents,
	PluginSettings,
} from "../types";
import { isSupportedAudioFile, normalizePath } from "../utils/helpers";
import { MetadataParser } from "./MetadataParser";

export class PlaylistManager {
	private app: App;
	private settings: PluginSettings;
	private metadataParser: MetadataParser;
	private fullPlaylist: MusicTrack[] = [];
	private viewPlaylist: MusicTrack[] = [];
	private currentTrack: MusicTrack | null = null;
	private currentCategory: CategoryType = "all";
	private events: Partial<PlaylistManagerEvents> = {};

	constructor(app: App, settings: PluginSettings) {
		this.app = app;
		this.settings = settings;
		this.metadataParser = new MetadataParser();
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
	 * 加载完整播放列表
	 */
	async loadFullPlaylist(): Promise<void> {
		this.fullPlaylist = [];

		const validFolders = this.settings.musicFolderPaths.filter(
			(p) => p && p.trim() !== ""
		);
		if (validFolders.length === 0) {
			this.updateView();
			return;
		}

		const allFiles = this.app.vault.getFiles();
		const collectedFiles = new Map<string, TFile>();

		// 收集音乐文件
		validFolders.forEach((folderPath) => {
			const normalizedPath = normalizePath(folderPath);
			allFiles.forEach((file) => {
				if (
					file.path.startsWith(normalizedPath) &&
					isSupportedAudioFile(file.name)
				) {
					collectedFiles.set(file.path, file);
				}
			});
		});

		// 创建播放列表项
		const fileArray = Array.from(collectedFiles.values());
		this.fullPlaylist = fileArray.map((file, index) => ({
			id: index,
			name: file.basename,
			path: file.path,
			resourcePath: this.app.vault.getResourcePath(file),
			metadata: this.settings.metadata[file.path] || {
				title: file.basename,
				artist: "未知艺术家",
				album: "未知专辑",
				cover: null,
			},
		}));

		this.updateView();
		this.emit("onPlaylistUpdate", this.viewPlaylist);
	}

	/**
	 * 刷新元数据
	 */
	async refreshMetadata(): Promise<void> {
		const validFolders = this.settings.musicFolderPaths.filter(
			(p) => p && p.trim() !== ""
		);
		if (validFolders.length === 0) {
			return;
		}

		const allFiles = this.app.vault.getFiles();
		const filesToProcess: TFile[] = [];

		// 收集需要处理的音乐文件
		validFolders.forEach((folderPath) => {
			const normalizedPath = normalizePath(folderPath);
			allFiles.forEach((file) => {
				if (
					file.path.startsWith(normalizedPath) &&
					isSupportedAudioFile(file.name)
				) {
					filesToProcess.push(file);
				}
			});
		});

		// 清空现有元数据
		this.settings.metadata = {};

		// 处理每个文件的元数据
		for (const file of filesToProcess) {
			try {
				const arrayBuffer = await this.app.vault.readBinary(file);
				const metadata = await this.metadataParser.extractMetadata(
					arrayBuffer
				);
				this.settings.metadata[file.path] = metadata;

				// 给UI一个更新的机会
				await new Promise((resolve) => setTimeout(resolve, 10));
			} catch (error) {
				console.error(
					`Failed to extract metadata from ${file.path}:`,
					error
				);
				this.settings.metadata[file.path] = {
					title: file.basename,
					artist: "未知艺术家",
					album: "未知专辑",
					cover: null,
				};
			}
		}

		// 重新加载播放列表
		await this.loadFullPlaylist();
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
	 * 清理资源
	 */
	cleanup(): void {
		this.metadataParser.cleanup();
	}
}
