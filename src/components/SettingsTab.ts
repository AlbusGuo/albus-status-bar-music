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

		// 标题和描述
		containerEl.createEl("h2", { text: "Status Bar Music 设置" });

		containerEl.createEl("p", {
			text: "在这里管理您的音乐文件夹。路径必须在您的 Obsidian 仓库内部。",
			cls: "setting-item-description",
		});

		containerEl.createEl("p", {
			text: "Manage your music folders here. Paths must be inside your Obsidian Vault.",
			cls: "setting-item-description",
		});

		// 现有文件夹设置
		this.displayFolderSettings();

		// 添加新文件夹按钮
		this.displayAddFolderButton();

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
	 * 显示文件夹设置
	 */
	private displayFolderSettings(): void {
		this.settings.musicFolderPaths.forEach((path, index) => {
			new Setting(this.containerEl)
				.setName(`音乐文件夹 ${index + 1}`)
				.setDesc("相对于仓库根目录的路径，例如: Music/Collection")
				.addText((text) => {
					text.setValue(path)
						.setPlaceholder("例如: Music/Collection")
						.onChange(async (value) => {
							this.settings.musicFolderPaths[index] = value
								.trim()
								.replace(/\\/g, "/");
							await this.saveCallback();
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon(ICONS.TRASH)
						.setTooltip("删除此文件夹")
						.onClick(async () => {
							this.settings.musicFolderPaths.splice(index, 1);
							await this.saveCallback();
							this.display(); // 重新渲染设置页面
						});
				});
		});
	}

	/**
	 * 显示添加文件夹按钮
	 */
	private displayAddFolderButton(): void {
		new Setting(this.containerEl).addButton((button) => {
			button
				.setButtonText("添加新文件夹")
				.setCta()
				.onClick(async () => {
					this.settings.musicFolderPaths.push("");
					await this.saveCallback();
					this.display(); // 重新渲染设置页面
				});
		});
	}

/**
	 * 显示元数据统计
	 */
	private displayMetadataStats(): void {
		// 分隔线
		this.containerEl.createEl("hr");

		// 创建一个容器用于动态更新
		this.metadataStatsContainer = this.containerEl.createEl("div", {
			cls: "metadata-stats-container",
		});

		// 元数据统计
		this.updateMetadataStats(this.metadataStatsContainer);

		// 清空缓存按钮
		this.displayClearCacheButton();
		
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

		new Setting(container)
			.setName("已缓存的元数据")
			.setDesc(`当前缓存了 ${metadataCount} 个音频文件的元数据信息`);
	}

	

	/**
	 * 显示清空缓存按钮
	 */
	private displayClearCacheButton(): void {
		new Setting(this.containerEl)
			.setName("清空元数据缓存")
			.setDesc("删除所有缓存的元数据，下次播放时将重新提取")
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
			
			console.log("Metadata cache cleared successfully");
		} catch (error) {
			console.error("Failed to clear metadata cache:", error);
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
