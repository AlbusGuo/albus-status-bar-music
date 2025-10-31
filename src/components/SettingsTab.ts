import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { PluginSettings } from "../types";
import { ICONS } from "../utils/constants";
import { ConfirmModal } from "./ConfirmModal";

export class SettingsTab extends PluginSettingTab {
	private settings: PluginSettings;
	private saveCallback: () => Promise<void>;
	private metadataStatsContainer: HTMLElement | null = null;
	private plugin: any;
	private updateInterval: NodeJS.Timeout | null = null;

	constructor(
		app: App,
		plugin: any,
		settings: PluginSettings,
		saveCallback: () => Promise<void>
	) {
		super(app, plugin);
		this.settings = settings;
		this.saveCallback = saveCallback;
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 标题
		containerEl.createEl("h2", { text: "Status Bar Music 设置" });

		// 音乐文件夹设置
		this.displayMusicFolderSetting();

		// 元数据统计
		this.displayMetadataStats();
		
		// 立即更新一次，确保显示最新数据
		setTimeout(() => {
			if (this.metadataStatsContainer) {
				this.updateMetadataStats(this.metadataStatsContainer);
			}
		}, 100);
	}

	/**
	 * 显示音乐文件夹设置
	 */
	private displayMusicFolderSetting(): void {
		new Setting(this.containerEl)
			.setName("音乐文件夹")
			.setDesc("设置包含音乐文件的文件夹路径。子文件夹将自动作为歌单。")
			.addText((text) => {
				text.setValue(this.settings.musicFolderPath)
					.setPlaceholder("例如: Music")
					.onChange(async (value) => {
						// 只保存设置，不自动加载
						this.settings.musicFolderPath = value.trim().replace(/\\/g, "/");
						await this.saveCallback();
					});
			})
			.addButton((button) => {
				button
					.setButtonText("加载音乐库")
					.setCta()
					.onClick(async () => {
						await this.reloadMusicLibrary();
					});
			});
	}

	

	/**
	 * 重新加载音乐库
	 */
	private async reloadMusicLibrary(): Promise<void> {
		try {
			// 检查是否设置了音乐文件夹路径
			if (!this.settings.musicFolderPath || this.settings.musicFolderPath.trim() === "") {
				new Notice("请先设置音乐文件夹路径");
				return;
			}

			// 显示加载提示
			const notice = new Notice("正在扫描音乐文件...", 5000);
			
			// 重新初始化播放列表管理器
			this.plugin.playlistManager.initializeMetadata(this.settings);
			await this.plugin.playlistManager.loadFullPlaylist();
			await this.plugin.playlistManager.refreshMetadata();
			
			// 播放列表显示会在 PlaylistManager 中自动更新
			// 这里不需要额外调用 updatePlaylist()
			
			// 保存设置
			await this.saveCallback();
			
			// 更新提示
			const playlist = this.plugin.playlistManager.getPlaylist();
			const playlists = this.plugin.playlistManager.getPlaylists();
			new Notice(`扫描完成！找到 ${playlist.length} 首歌曲，${playlists.length} 个歌单`);
		} catch (error) {
			console.error("扫描音乐库失败:", error);
			new Notice("扫描音乐库失败，请检查路径是否正确");
		}
	}

/**
	 * 显示元数据统计
	 */
	private displayMetadataStats(): void {
		// 创建一个容器用于动态更新
		this.metadataStatsContainer = this.containerEl.createEl("div", {
			cls: "metadata-stats-container",
		});

		// 元数据统计（包含清空缓存按钮）
		this.updateMetadataStats(this.metadataStatsContainer);
		
		// 延迟更新一次，确保元数据管理器已初始化
		setTimeout(() => {
			this.updateMetadataStats(this.metadataStatsContainer!);
		}, 1000);
		
		// 启动定期更新，确保显示始终准确
		this.startPeriodicUpdate();
	}

	/**
	 * 更新元数据统计显示
	 */
	private updateMetadataStats(container: HTMLElement): void {
		container.empty();
		
		// 从插件获取最新的元数据数量
		let metadataCount = 0;
		if (this.plugin && this.plugin.playlistManager) {
			const metadataManager = this.plugin.playlistManager.metadataManager;
			if (metadataManager) {
				metadataCount = metadataManager.getCacheSize();
			}
		} else {
			// 备用方案：直接从设置获取
			metadataCount = Object.keys(this.settings.metadata || {}).length;
		}

		// 创建包含统计信息和清空按钮的设置项
		new Setting(container)
			.setName("已缓存的元数据")
			.setDesc(`当前缓存了 ${metadataCount} 个音频文件的元数据信息`)
			.addButton((button) => {
				button
					.setButtonText("清空缓存")
					.setWarning()
					.onClick(() => {
						this.showClearCacheConfirmation();
					});
			});
	}

	/**
	 * 显示清空缓存确认对话框
	 */
	private showClearCacheConfirmation(): void {
		const modal = new ConfirmModal(
			this.app,
			"清空元数据缓存",
			"确定要清空所有缓存的元数据吗？\n\n此操作将删除所有已提取的元数据信息，包括歌曲标题、艺术家、专辑和封面图片。下次播放音乐时将重新提取这些信息。",
			"清空缓存",
			async () => {
				await this.clearMetadataCache();
			}
		);
		modal.open();
	}

	/**
	 * 清空元数据缓存
	 */
	private async clearMetadataCache(): Promise<void> {
		try {
			// 调用主插件的清空缓存方法
			await this.plugin.clearMetadataCache();
			
			// 更新显示
			if (this.metadataStatsContainer) {
				this.updateMetadataStats(this.metadataStatsContainer);
			}
			
			// 显示成功提示
			new Notice("元数据缓存已清空");
		} catch (error) {
			new Notice("清空缓存失败，请重试");
		}
	}

	

	/**
	 * 启动定期更新
	 */
	private startPeriodicUpdate(): void {
		// 清除现有定时器
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}
		
		// 每2秒更新一次元数据统计
		this.updateInterval = setInterval(() => {
			if (this.metadataStatsContainer) {
				this.updateMetadataStats(this.metadataStatsContainer);
			}
		}, 2000);
	}

	/**
	 * 停止定期更新
	 */
	private stopPeriodicUpdate(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	/**
	 * 更新设置引用
	 */
	updateSettings(settings: PluginSettings): void {
		this.settings = settings;
		
		// 更新元数据统计显示
		if (this.metadataStatsContainer) {
			// 延迟更新，确保元数据管理器状态同步
			setTimeout(() => {
				this.updateMetadataStats(this.metadataStatsContainer!);
			}, 100);
		}
	}

	/**
	 * 隐藏设置页面时清理
	 */
	hide(): void {
		this.stopPeriodicUpdate();
		super.hide();
	}
}
