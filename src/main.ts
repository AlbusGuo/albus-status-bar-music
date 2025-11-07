import { Plugin } from "obsidian";
import { MusicHubComponent } from "./components/MusicHubComponent";
import { SettingsTab } from "./components/SettingsTab";
import { StatusBarComponent } from "./components/StatusBarComponent";
import { AudioPlayerService } from "./services/AudioPlayerService";
import { LyricsService } from "./services/LyricsService";
import { PlaylistManager } from "./services/PlaylistManager";
import "./styles/styles";
import { MusicTrack, PlaybackMode, PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./utils/helpers";

export default class StatusBarMusicPlugin extends Plugin {
	settings: PluginSettings;
	private playlistManager: PlaylistManager;
	private audioPlayer: AudioPlayerService;
	private lyricsService: LyricsService;
	private statusBar: StatusBarComponent | null = null;
	private musicHub: MusicHubComponent;
	private settingsTab: SettingsTab;
	private playlistUpdateTimeout: NodeJS.Timeout | null = null;
	private isLyricsDisplayEnabled: boolean = false;

	async onload() {
		try {
			// 加载设置
			await this.loadSettings();

			// 迁移旧设置到新设置格式
			this.migrateSettings(); // 初始化服务
			this.initializeServices();

			// 创建UI组件
			this.createUI();

			// 设置事件监听
			this.setupEventListeners();

			// 注册命令
			this.registerCommands();

			// 注册文件变化监听
			this.registerFileEvents();

			// 添加设置页面
			this.addSettingTab(this.settingsTab);

			// 异步加载播放列表并刷新元数据
			setTimeout(async () => {
				try {
					// 首先初始化元数据管理器（从data.json加载已有数据）
					const currentSettings = this.settings;
					this.playlistManager.initializeMetadata(currentSettings);

					// 创建状态栏（无论是否有音乐文件都要创建）
					this.createStatusBar();

					// 检查是否有音乐文件夹路径
					if (
						currentSettings.musicFolderPath &&
						currentSettings.musicFolderPath.trim() !== ""
					) {
						// 有音乐文件夹路径，加载播放列表
						await this.playlistManager.loadFullPlaylist();

						// 刷新元数据（重新扫描文件，解决blob URL失效）
						await this.playlistManager.refreshMetadata();
						await this.saveSettings();

						console.log(
							"StatusBarMusicPlugin: Music library loaded successfully"
						);
					} else {
						console.log(
							"StatusBarMusicPlugin: No music folder set, waiting for user configuration"
						);
					}
				} catch (error) {
					console.error(
						"StatusBarMusicPlugin: Failed to load playlist or refresh metadata",
						error
					);
				}
			}, 100);
		} catch (error) {
			// 静默处理错误，避免干扰用户体验
		}
	}

	/**
	 * 初始化服务
	 */
	private initializeServices(): void {
		this.playlistManager = new PlaylistManager(
			this.app,
			this.settings,
			() => this.settings
		);
		this.audioPlayer = new AudioPlayerService();
		this.lyricsService = new LyricsService(this.app);

		// 设置元数据管理器的保存回调
		const metadataManager = (this.playlistManager as any).metadataManager;
		if (metadataManager) {
			metadataManager.setSaveCallback(() => {
				this.saveSettings();
			});
		}

		this.settingsTab = new SettingsTab(this.app, this, this.settings, () =>
			this.saveSettings()
		);
	}

	/**
	 * 注册命令
	 */
	private registerCommands(): void {}

	/**
	 * 创建UI组件
	 */
	private createUI(): void {
		// 创建音乐中心组件
		this.musicHub = new MusicHubComponent();

		// 应用音乐中心设置
		this.updateMusicHubBehavior();

		// 创建状态栏组件
		const statusBarItem = this.addStatusBarItem();
		this.statusBar = new StatusBarComponent(statusBarItem);
	}

	/**
	 * 创建状态栏组件
	 */
	private createStatusBar(): void {
		if (!this.statusBar) return;

		// 设置状态栏事件监听器
		this.setupStatusBarEvents();

		// 更新状态栏显示当前状态
		this.updateStatusBarAfterCreation();

		// 应用按钮显示设置
		this.updateStatusBarButtons();
	}

	/**
	 * 设置状态栏事件监听器
	 */
	private setupStatusBarEvents(): void {
		if (!this.statusBar) return;

		// 状态栏按钮事件
		this.statusBar.on("onPrevious", () => {
			const prevTrack = this.playlistManager.playPrevious();
			if (prevTrack) {
				this.audioPlayer.loadTrack(prevTrack).then(() => {
					this.audioPlayer.play();
				});
			}
		});

		this.statusBar.on("onPlayPause", () => {
			this.togglePlayPause();
		});

		this.statusBar.on("onNext", () => {
			const nextTrack = this.playlistManager.playNext();
			if (nextTrack) {
				this.audioPlayer.loadTrack(nextTrack).then(() => {
					this.audioPlayer.play();
				});
			}
		});

		this.statusBar.on("onTrackClick", () => {
			this.musicHub.toggle(this.statusBar!.getElement());
		});
	}

	/**
	 * 状态栏创建后更新显示
	 */
	private updateStatusBarAfterCreation(): void {
		if (!this.statusBar) return;

		const currentTrack = this.playlistManager.getCurrentTrack();
		const isPlaying = this.audioPlayer.getIsPlaying();

		if (currentTrack) {
			this.statusBar.updateTrack(currentTrack);
		}
		this.statusBar.updatePlayState(isPlaying);

		// 更新播放列表
		this.updatePlaylist();
	}

	/**
	 * 设置事件监听
	 */
	private setupEventListeners(): void {
		// 状态栏事件将在状态栏创建后设置
		// 见 setupStatusBarEvents() 方法

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

		// 黑胶唱片播放器事件
		this.musicHub.on("onVinylPlayPause", () => {
			this.togglePlayPause();
		});

		this.musicHub.on("onCategoryChange", (category: string) => {
			this.playlistManager.setCategory(category);
		});

		this.musicHub.on("onSearch", (query: string) => {
			this.playlistManager.setSearchQuery(query);
		});

		this.musicHub.on("onCategoryChange", (category: string) => {
			this.playlistManager.setCategory(category as any);
		});

		this.musicHub.on("onGetCategories", () => {
			return this.playlistManager.getCategories();
		});

		this.musicHub.on("onGetCurrentCategory", () => {
			return this.playlistManager.getCurrentCategory();
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

		this.musicHub.on("onPrevious", async () => {
			const prevTrack = this.playlistManager.playPrevious();
			if (prevTrack) {
				await this.audioPlayer.loadTrack(prevTrack);
				await this.audioPlayer.play();
			}
		});

		this.musicHub.on("onNext", async () => {
			const nextTrack = this.playlistManager.playNext();
			if (nextTrack) {
				await this.audioPlayer.loadTrack(nextTrack);
				await this.audioPlayer.play();
			}
		});

		// 歌词相关事件
		this.musicHub.on("onLyricsToggle", (enableStatusBarLyrics: boolean) => {
			// 设置状态栏歌词显示状态
			this.isLyricsDisplayEnabled = enableStatusBarLyrics;

			// 更新状态栏显示模式
			if (this.statusBar) {
				this.statusBar.setLyricsMode(enableStatusBarLyrics);
			}

			// 如果启用状态栏歌词模式，立即更新当前歌词
			if (enableStatusBarLyrics) {
				const currentLyricsText =
					this.lyricsService.getCurrentLineText();
				if (this.statusBar) {
					this.statusBar.updateLyricsText(currentLyricsText);
				}
			}
		});

		this.musicHub.on("onSeekToTime", (time: number) => {
			this.audioPlayer.seekTo(time);
		});

		this.musicHub.on("onVolumeChange", (volume: number) => {
			this.audioPlayer.setVolume(volume);
		});

		// 歌词服务事件 - 当前歌词行变化时更新状态栏
		this.lyricsService.on("onCurrentLineChange", (lineIndex: number) => {
			// 更新状态栏歌词
			if (this.isLyricsDisplayEnabled && this.statusBar) {
				const currentLyricsText =
					this.lyricsService.getCurrentLineText();
				this.statusBar.updateLyricsText(currentLyricsText);
			}

			// 更新悬浮歌词
			this.musicHub.updateCurrentLyricsLine(lineIndex);
		});

		// 歌词服务事件 - 歌词加载完成
		this.lyricsService.on("onLyricsLoaded", (lyrics) => {
			// 当歌词加载完成且处于歌词模式时，显示第一行歌词或清空显示
			if (this.isLyricsDisplayEnabled && this.statusBar) {
				const initialText =
					lyrics && lyrics.lines.length > 0
						? lyrics.lines[0].text
						: "";
				this.statusBar.updateLyricsText(initialText);
			}
		});

		// 播放列表管理器事件
		this.playlistManager.on("onTrackChange", (track) => {
			if (this.statusBar) {
				this.statusBar.updateTrack(track);
			}
			this.musicHub.updateCurrentTrack(track);
			this.updateHubSideVinyls();
			this.updateFavoriteButton();
			// 不在这里调用 updatePlaylist()，避免高频重新渲染
			// 只需要更新当前播放状态，而不是重新渲染整个列表
			this.musicHub.updateCurrentPlayingTrack(track);

			// 预加载曲目到AudioPlayerService（不自动播放）
			if (track) {
				this.audioPlayer.loadTrack(track).catch((error) => {
					console.warn("Failed to preload track:", error);
				});
			}

			// 加载歌词
			this.loadLyricsForTrack(track);
		});

		this.playlistManager.on("onPlaylistUpdate", () => {
			this.updatePlaylist();
			this.updateHubSideVinyls();
		});

		this.playlistManager.on("onModeChange", (mode) => {
			this.musicHub.updateModeIcon(mode);
		});

		// 音频播放器事件
		this.audioPlayer.on("onPlay", () => {
			if (this.statusBar) {
				this.statusBar.updatePlayState(true);
			}
			this.musicHub.updatePlayState(true);
		});

		this.audioPlayer.on("onPause", () => {
			if (this.statusBar) {
				this.statusBar.updatePlayState(false);
			}
			this.musicHub.updatePlayState(false);
		});

		this.audioPlayer.on("onEnded", () => {
			this.handleTrackEnd();
		});

		this.audioPlayer.on("onTimeUpdate", () => {
			this.updateProgress();
			this.updateLyricsTime();
		});

		this.audioPlayer.on("onLoadStart", () => {
			if (this.statusBar) {
				this.statusBar.showLoading(true);
			}
		});

		this.audioPlayer.on("onLoadEnd", () => {
			if (this.statusBar) {
				this.statusBar.showLoading(false);
			}
		});

		this.audioPlayer.on("onError", (error) => {
			// 音频播放器错误处理
			if (this.statusBar) {
				this.statusBar.showLoading(false);
			}
		});
	}

	/**
	 * 更新音乐中心的左右唱片
	 */
	private updateHubSideVinyls(): void {
		const currentTrack = this.playlistManager.getCurrentTrack();
		const playlist = this.playlistManager.getViewPlaylist();

		if (!currentTrack || !playlist || playlist.length <= 1) {
			this.musicHub.updateSideVinyls(null, null);
			return;
		}

		const currentIndex = playlist.findIndex(
			(track) => track.path === currentTrack.path
		);

		// 获取上一首和下一首
		const prevTrack =
			currentIndex > 0
				? playlist[currentIndex - 1]
				: playlist[playlist.length - 1];
		const nextTrack =
			currentIndex < playlist.length - 1
				? playlist[currentIndex + 1]
				: playlist[0];

		this.musicHub.updateSideVinyls(prevTrack, nextTrack);
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
			// 播放失败处理
		}
	}

	/**
	 * 为指定曲目加载歌词
	 */
	private async loadLyricsForTrack(track: MusicTrack | null): Promise<void> {
		if (!track) {
			this.musicHub.updateLyrics(null);
			return;
		}

		try {
			const lyrics = await this.lyricsService.loadLyricsForTrack(track);
			this.musicHub.updateLyrics(lyrics);
		} catch (error) {
			console.warn("Failed to load lyrics for track:", track.name, error);
			this.musicHub.updateLyrics(null);
		}
	}

	/**
	 * 更新歌词当前时间
	 */
	private updateLyricsTime(): void {
		const currentTime = this.audioPlayer.getCurrentTime();
		this.lyricsService.updateCurrentTime(currentTime);
		// 不再在这里直接更新 UI，改为依赖 onCurrentLineChange 事件
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

			// 检查AudioPlayer是否已加载当前曲目
			const audioCurrentTrack = this.audioPlayer.getCurrentTrack();
			if (
				!audioCurrentTrack ||
				audioCurrentTrack.path !== currentTrack.path
			) {
				// 如果AudioPlayer中的曲目与当前曲目不一致，先加载曲目
				await this.audioPlayer.loadTrack(currentTrack);
			}

			await this.audioPlayer.togglePlayPause();
		} catch (error) {
			console.warn("Failed to toggle play/pause:", error);
			// 播放失败时尝试重新加载曲目
			const currentTrack = this.playlistManager.getCurrentTrack();
			if (currentTrack) {
				try {
					await this.audioPlayer.loadTrack(currentTrack);
					await this.audioPlayer.play();
				} catch (retryError) {
					console.error(
						"Failed to retry play after error:",
						retryError
					);
				}
			}
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

		if (this.statusBar) {
			this.statusBar.updateProgress(progress);
		}
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
	 * 更新播放列表显示（带防抖）
	 */
	private updatePlaylist(): void {
		// 清除之前的定时器
		if (this.playlistUpdateTimeout) {
			clearTimeout(this.playlistUpdateTimeout);
		}

		// 设置新的定时器，100ms后执行
		this.playlistUpdateTimeout = setTimeout(() => {
			const playlist = this.playlistManager.getViewPlaylist();
			const currentTrack = this.playlistManager.getCurrentTrack();
			const metadataManager = (this.playlistManager as any)
				.metadataManager;
			const isMetadataInitialized = metadataManager
				? metadataManager.isFullyInitialized()
				: false;
			this.musicHub.renderPlaylist(
				playlist,
				currentTrack,
				isMetadataInitialized
			);
		}, 100);
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
			const metadataManager = (this.playlistManager as any)
				.metadataManager;
			if (metadataManager && metadataManager.needsSave()) {
				const metadataExport = metadataManager.exportToSettings();
				this.settings.metadata = metadataExport.metadata;
			}
		}

		await this.saveData(this.settings);

		// 更新设置页面的设置引用
		if (this.settingsTab) {
			this.settingsTab.updateSettings(this.settings);
		}
	}

	/**
	 * 清空元数据缓存
	 */
	async clearMetadataCache(): Promise<void> {
		try {
			// 清空播放列表管理器中的缓存
			this.playlistManager.clearMetadataCache();

			// 清空设置中的元数据
			this.settings.metadata = {};

			// 保存设置
			await this.saveSettings();
		} catch (error) {
			// 元数据缓存清理失败处理
			throw error;
		}
	}

	/**
	 * 获取元数据管理器（供设置页面使用）
	 */
	get metadataManager() {
		return (this.playlistManager as any).metadataManager;
	}

	/**
	 * 更新状态栏按钮显示
	 */
	updateStatusBarButtons(): void {
		if (this.statusBar) {
			this.statusBar.setControlButtonsVisible(
				this.settings.showControlButtons
			);
		}
	}

	/**
	 * 更新音乐中心行为
	 */
	updateMusicHubBehavior(): void {
		if (this.musicHub) {
			this.musicHub.setCloseOnClickOutside(
				this.settings.closeHubOnClickOutside
			);
		}
	}

	/**
	 * 卸载插件
	 */
	onunload(): void {
		// 清理防抖定时器
		if (this.playlistUpdateTimeout) {
			clearTimeout(this.playlistUpdateTimeout);
		}

		// 停止音频播放
		if (this.audioPlayer) {
			this.audioPlayer.cleanup();
		}

		// 清理歌词服务
		if (this.lyricsService) {
			this.lyricsService.cleanup();
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
	}

	/**
	 * 迁移旧设置到新设置格式
	 */
	private migrateSettings(): void {
		// 兼容旧版本设置：如果有多个音乐文件夹，使用第一个作为主文件夹
		if (
			(this.settings as any).musicFolderPaths &&
			Array.isArray((this.settings as any).musicFolderPaths)
		) {
			const oldPaths = (this.settings as any)
				.musicFolderPaths as string[];
			if (oldPaths.length > 0 && !this.settings.musicFolderPath) {
				this.settings.musicFolderPath = oldPaths[0];
				this.saveSettings();
			}
		}
	}
}
