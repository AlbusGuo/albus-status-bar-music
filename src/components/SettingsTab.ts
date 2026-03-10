import { App, PluginSettingTab, Setting, SettingGroup, Notice } from "obsidian";
import { PluginSettings } from "../types";
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

		// 音乐库设置组
		this.displayMusicLibraryGroup();

		// 界面设置组
		this.displayUIGroup();

		// 歌词设置组
		this.displayLyricsGroup();
	}

	/**
	 * 音乐库设置组
	 */
	private displayMusicLibraryGroup(): void {
		const group = new SettingGroup(this.containerEl)
			.setHeading("音乐库");

		group.addSetting((s) => {
			s.setName("音乐文件夹")
				.setDesc("设置包含音乐文件的文件夹路径，子文件夹将自动成为歌单。")
				.addText((text) => {
					text.setValue(this.settings.musicFolderPath)
						.setPlaceholder("例如 Music")
						.onChange(async (value) => {
							this.settings.musicFolderPath = value.trim().replace(/\\/g, "/");
							await this.saveCallback();
						});
				})
				.addButton((button) => {
					button
						.setButtonText("扫描")
						.setCta()
						.onClick(async () => {
							await this.reloadMusicLibrary();
						});
				});
		});

		// 元数据统计放入同一组
		group.addSetting((s) => {
			this.metadataStatsContainer = s.settingEl;
			this.updateMetadataStatsInline(s);
		});

		this.startPeriodicUpdate();
	}

	/**
	 * 界面设置组
	 */
	private displayUIGroup(): void {
		const group = new SettingGroup(this.containerEl)
			.setHeading("界面");

		group.addSetting((s) => {
			s.setName("显示状态栏控制按钮")
				.setDesc("在状态栏显示上一首、播放/暂停、下一首按钮")
				.addToggle((toggle) => {
					toggle
						.setValue(this.settings.showControlButtons)
						.onChange(async (value) => {
							this.settings.showControlButtons = value;
							await this.saveCallback();
							this.plugin.updateStatusBarButtons();
						});
				});
		});

		group.addSetting((s) => {
			s.setName("点击外部关闭播放器")
				.setDesc("启用后，点击音乐播放器外部区域将自动关闭播放器")
				.addToggle((toggle) => {
					toggle
						.setValue(this.settings.closeHubOnClickOutside)
						.onChange(async (value) => {
							this.settings.closeHubOnClickOutside = value;
							await this.saveCallback();
							this.plugin.updateMusicHubBehavior();
						});
				});
		});

		group.addSetting((s) => {
			s.setName("显示加载完成提示")
				.setDesc("音乐库加载完毕后是否显示提示信息")
				.addToggle((toggle) => {
					toggle
						.setValue(this.settings.showLoadNotice)
						.onChange(async (value) => {
							this.settings.showLoadNotice = value;
							await this.saveCallback();
						});
				});
		});
	}

	/**
	 * 歌词设置组
	 */
	private displayLyricsGroup(): void {
		const group = new SettingGroup(this.containerEl)
			.setHeading("外观");

		group.addSetting((s) => {
			s.setName("播放器主色调")
				.setDesc("启用后可分别设置浅色/深色模式的播放器主色调（影响进度条、唱片、歌词高亮等所有强调色），关闭则使用主题强调色。")
				.addToggle((toggle) => {
					toggle
						.setValue(this.settings.enableCustomLyricsColor)
						.onChange(async (value) => {
							this.settings.enableCustomLyricsColor = value;
							await this.saveCallback();
							this.plugin.applyLyricsColors?.();
							this.display();
						});
				});
		});

		if (this.settings.enableCustomLyricsColor) {
			group.addSetting((s) => {
				s.setName("浅色模式主色调")
					.setDesc("浅色主题下播放器强调色，留空使用默认值。")
					.addColorPicker((cp) => {
						cp.setValue(this.settings.lyricsHighlightColorLight || "#0288d1")
							.onChange(async (value) => {
								this.settings.lyricsHighlightColorLight = value;
								await this.saveCallback();
								this.plugin.applyLyricsColors?.();
							});
					})
					.addExtraButton((btn) => {
						btn.setIcon("reset")
							.setTooltip("恢复默认")
							.onClick(async () => {
								this.settings.lyricsHighlightColorLight = "";
								await this.saveCallback();
								this.plugin.applyLyricsColors?.();
								this.display();
							});
					});
			});

			group.addSetting((s) => {
				s.setName("深色模式主色调")
					.setDesc("深色主题下播放器强调色，留空使用默认值。")
					.addColorPicker((cp) => {
						cp.setValue(this.settings.lyricsHighlightColorDark || "#4fc3f7")
							.onChange(async (value) => {
								this.settings.lyricsHighlightColorDark = value;
								await this.saveCallback();
								this.plugin.applyLyricsColors?.();
							});
					})
					.addExtraButton((btn) => {
						btn.setIcon("reset")
							.setTooltip("恢复默认")
							.onClick(async () => {
								this.settings.lyricsHighlightColorDark = "";
								await this.saveCallback();
								this.plugin.applyLyricsColors?.();
								this.display();
							});
					});
			});
		}
	}


	/**
	 * 重新加载音乐库
	 */
	private async reloadMusicLibrary(): Promise<void> {
		try {
			if (!this.settings.musicFolderPath?.trim()) {
				new Notice("请先设置音乐文件夹路径");
				return;
			}

			new Notice("正在扫描音乐文件...", 5000);

			this.plugin.playlistManager.initializeMetadata(this.settings);
			await this.plugin.playlistManager.loadFullPlaylist();
			await this.plugin.playlistManager.refreshMetadata();
			await this.saveCallback();

			const playlist = this.plugin.playlistManager.getPlaylist();
			const playlists = this.plugin.playlistManager.getPlaylists();
			new Notice(`扫描完成！共 ${playlist.length} 首歌曲，${playlists.length} 个歌单`);
		} catch {
			new Notice("扫描失败，请检查文件夹路径。");
		}
	}

/**
	 * 内联更新元数据统计（在 SettingGroup 内部）
	 */
	private updateMetadataStatsInline(setting: Setting): void {
		let metadataCount = 0;
		if (this.plugin?.playlistManager) {
			const metadataManager = this.plugin.playlistManager.metadataManager;
			if (metadataManager) {
				metadataCount = metadataManager.getCacheSize();
			}
		} else {
			metadataCount = Object.keys(this.settings.metadata || {}).length;
		}

		setting.setName("已缓存元数据")
			.setDesc(`当前已缓存 ${metadataCount} 个音频文件的元数据`)
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
			"确定要清空所有已缓存的元数据吗？\n\n这将移除所有已提取的歌曲标题、艺术家、专辑和封面信息。这些数据将在下次播放时重新提取。",
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
			await this.plugin.clearMetadataCache();
			this.display(); // 刷新页面以更新统计
			new Notice("元数据缓存已清空");
		} catch {
			new Notice("清空缓存失败，请重试。");
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
		
		// 每3秒仅刷新元数据统计文字（不重绘页面，避免销毁调色盘弹窗）
		this.updateInterval = setInterval(() => {
			this.updateMetadataStatsText();
		}, 3000);
	}

	/**
	 * 仅更新元数据统计文字（不重绘页面）
	 */
	private updateMetadataStatsText(): void {
		if (!this.metadataStatsContainer) return;
		let metadataCount = 0;
		if (this.plugin?.playlistManager) {
			const metadataManager = this.plugin.playlistManager.metadataManager;
			if (metadataManager) {
				metadataCount = metadataManager.getCacheSize();
			}
		} else {
			metadataCount = Object.keys(this.settings.metadata || {}).length;
		}
		const descEl = this.metadataStatsContainer.querySelector(".setting-item-description");
		if (descEl) {
			descEl.textContent = `当前已缓存 ${metadataCount} 个音频文件的元数据`;
		}
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
	}

	/**
	 * 隐藏设置页面时清理
	 */
	hide(): void {
		this.stopPeriodicUpdate();
		super.hide();
	}
}
