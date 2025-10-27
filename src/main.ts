import { Plugin } from "obsidian";
import { MusicHubComponent } from "./components/MusicHubComponent";
import { SettingsTab } from "./components/SettingsTab";
import { StatusBarComponent } from "./components/StatusBarComponent";
import { AudioPlayerService } from "./services/AudioPlayerService";
import { PlaylistManager } from "./services/PlaylistManager";
import "./styles/styles";
import { PlaybackMode, PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./utils/helpers";

export default class StatusBarMusicPlugin extends Plugin {
	settings: PluginSettings;
	private playlistManager: PlaylistManager;
	private audioPlayer: AudioPlayerService;
	private statusBar: StatusBarComponent;
	private musicHub: MusicHubComponent;
	private settingsTab: SettingsTab;

	async onload() {
		try {
			// 加载设置
			await this.loadSettings();

			// 初始化服务
			this.initializeServices();

			// 创建UI组件
			this.createUI();

			// 设置事件监听
			this.setupEventListeners();

			// 注册文件变化监听
			this.registerFileEvents();

			// 添加设置页面
			this.addSettingTab(this.settingsTab);

			// 异步延迟加载播放列表，避免阻塞 Obsidian 启动
			setTimeout(async () => {
				await this.playlistManager.loadFullPlaylist();
				console.log("Playlist loaded asynchronously");
			}, 500); // 增加延迟时间

			console.log("Status Bar Music plugin loaded successfully");
		} catch (error) {
			console.error("Failed to load Status Bar Music plugin:", error);
		}
	}

	/**
	 * 初始化服务
	 */
	private initializeServices(): void {
		this.playlistManager = new PlaylistManager(this.app, this.settings, () => this.settings);
		this.audioPlayer = new AudioPlayerService();

		this.settingsTab = new SettingsTab(
			this.app,
			this,
			this.settings,
			() => this.saveSettings()
		);
	}

	/**
	 * 创建UI组件
	 */
	private createUI(): void {
		// 创建状态栏组件
		const statusBarItem = this.addStatusBarItem();
		this.statusBar = new StatusBarComponent(statusBarItem);

		// 创建音乐中心组件
		this.musicHub = new MusicHubComponent();
	}

	/**
	 * 设置事件监听
	 */
	private setupEventListeners(): void {
		// 状态栏事件
		this.statusBar.on("onPrevious", () => {
			const prevTrack = this.playlistManager.playPrevious();
			if (prevTrack) {
				this.playTrack(prevTrack);
			}
		});

		this.statusBar.on("onPlayPause", () => {
			this.togglePlayPause();
		});

		this.statusBar.on("onNext", () => {
			const nextTrack = this.playlistManager.playNext();
			if (nextTrack) {
				this.playTrack(nextTrack);
			}
		});

		this.statusBar.on("onTrackClick", () => {
			this.musicHub.toggle(this.statusBar.getElement());
		});

		// 音乐中心事件
		this.musicHub.on("onFavoriteToggle", () => {
			this.playlistManager.toggleFavorite();
			this.updateFavoriteButton();
			this.saveSettings();
		});

		this.musicHub.on("onRefresh", async () => {
			this.musicHub.setRefreshLoading(true);
			try {
				await this.playlistManager.refreshMetadata();
				await this.saveSettings();
			} finally {
				this.musicHub.setRefreshLoading(false);
			}
		});

		this.musicHub.on("onCategoryChange", (category: string) => {
			this.playlistManager.setCategory(category);
		});

		this.musicHub.on("onModeToggle", () => {
			this.togglePlaybackMode();
		});

		this.musicHub.on("onSeek", (percent: number) => {
			this.audioPlayer.seekToPercent(percent);
		});

		this.musicHub.on("onTrackSelect", (track) => {
			this.playTrack(track);
		});

		// 播放列表管理器事件
		this.playlistManager.on("onTrackChange", (track) => {
			this.statusBar.updateTrack(track);
			this.updateFavoriteButton();
			this.updatePlaylist();
		});

		this.playlistManager.on("onPlaylistUpdate", () => {
			this.updateCategorySelector();
			this.updatePlaylist();
		});

		this.playlistManager.on("onModeChange", (mode) => {
			this.musicHub.updateModeIcon(mode);
		});

		// 音频播放器事件
		this.audioPlayer.on("onPlay", () => {
			this.statusBar.updatePlayState(true);
		});

		this.audioPlayer.on("onPause", () => {
			this.statusBar.updatePlayState(false);
		});

		this.audioPlayer.on("onEnded", () => {
			this.handleTrackEnd();
		});

		this.audioPlayer.on("onTimeUpdate", () => {
			this.updateProgress();
		});

		this.audioPlayer.on("onLoadStart", () => {
			this.statusBar.showLoading(true);
		});

		this.audioPlayer.on("onLoadEnd", () => {
			this.statusBar.showLoading(false);
		});

		this.audioPlayer.on("onError", (error) => {
			console.error("Audio player error:", error);
			this.statusBar.showLoading(false);
		});
	}

	/**
	 * 注册文件事件
	 */
	private registerFileEvents(): void {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				this.playlistManager.handleFileChange(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.playlistManager.handleFileChange(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.playlistManager.handleFileChange(oldPath);
			})
		);
	}

	/**
	 * 播放曲目
	 */
	private async playTrack(track: any): Promise<void> {
		try {
			this.playlistManager.loadTrack(track, true);
			await this.audioPlayer.loadTrack(track);
			await this.audioPlayer.play();
		} catch (error) {
			console.error("Failed to play track:", error);
		}
	}

	/**
	 * 切换播放/暂停
	 */
	private async togglePlayPause(): Promise<void> {
		try {
			const currentTrack = this.playlistManager.getCurrentTrack();
			if (!currentTrack) {
				// 如果没有当前曲目，播放第一首
				const playlist = this.playlistManager.getViewPlaylist();
				if (playlist.length > 0) {
					await this.playTrack(playlist[0]);
				}
				return;
			}

			await this.audioPlayer.togglePlayPause();
		} catch (error) {
			console.error("Failed to toggle play/pause:", error);
		}
	}

	/**
	 * 切换播放模式
	 */
	private togglePlaybackMode(): void {
		const modes: PlaybackMode[] = ["loop", "single", "shuffle"];
		const currentMode = this.settings.playbackMode;
		const currentIndex = modes.indexOf(currentMode);
		const nextMode = modes[(currentIndex + 1) % modes.length];

		this.playlistManager.setPlaybackMode(nextMode);
		this.settings.playbackMode = nextMode;
		this.saveSettings();
	}

	/**
	 * 处理曲目结束
	 */
	private handleTrackEnd(): void {
		if (this.settings.playbackMode === "single") {
			// 单曲循环
			this.audioPlayer.seekTo(0);
			this.audioPlayer.play();
		} else {
			// 播放下一首
			const nextTrack = this.playlistManager.playNext();
			if (nextTrack) {
				this.playTrack(nextTrack);
			}
		}
	}

	/**
	 * 更新进度显示
	 */
	private updateProgress(): void {
		const progress = this.audioPlayer.getProgress();
		const currentTime = this.audioPlayer.getCurrentTime();
		const duration = this.audioPlayer.getDuration();

		this.statusBar.updateProgress(progress);
		this.musicHub.updateProgress(currentTime, duration);
	}

	/**
	 * 更新收藏按钮
	 */
	private updateFavoriteButton(): void {
		const isFavorite = this.playlistManager.isFavorite();
		this.musicHub.updateFavoriteButton(isFavorite);
	}

	/**
	 * 更新分类选择器
	 */
	private updateCategorySelector(): void {
		const categories = this.playlistManager.getCategories();
		this.musicHub.updateCategorySelector(categories);
	}

	/**
	 * 更新播放列表显示
	 */
	private updatePlaylist(): void {
		const playlist = this.playlistManager.getViewPlaylist();
		const currentTrack = this.playlistManager.getCurrentTrack();
		this.musicHub.renderPlaylist(playlist, currentTrack);
	}

	/**
	 * 加载设置
	 */
	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	/**
	 * 保存设置
	 */
	async saveSettings(): Promise<void> {
		// 确保元数据管理器的最新数据已导出到设置
		if (this.playlistManager) {
			const metadataManager = (this.playlistManager as any).metadataManager;
			if (metadataManager && metadataManager.needsSave()) {
				const metadataExport = metadataManager.exportToSettings();
				this.settings.metadata = metadataExport.metadata;
			}
		}
		
		const metadataCount = Object.keys(this.settings.metadata || {}).length;
		console.log(`Saving settings with ${metadataCount} metadata entries`);
		
		await this.saveData(this.settings);
		
		console.log("Settings saved successfully");

		// 更新设置页面的设置引用
		if (this.settingsTab) {
			this.settingsTab.updateSettings(this.settings);
		}
	}

	/**
	 * 卸载插件
	 */
	onunload(): void {
		// 停止音频播放
		if (this.audioPlayer) {
			this.audioPlayer.cleanup();
		}

		// 清理播放列表管理器
		if (this.playlistManager) {
			this.playlistManager.cleanup();
		}

		// 清理UI组件
		if (this.statusBar) {
			this.statusBar.cleanup();
		}

		if (this.musicHub) {
			this.musicHub.cleanup();
		}

		console.log("Status Bar Music plugin unloaded");
	}
}
