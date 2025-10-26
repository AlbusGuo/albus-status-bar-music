import { App, PluginSettingTab, Setting } from "obsidian";
import { PluginSettings } from "../types";
import { ICONS } from "../utils/constants";

export class SettingsTab extends PluginSettingTab {
	private settings: PluginSettings;
	private saveCallback: () => Promise<void>;
	private refreshCallback: () => Promise<void>;

	constructor(
		app: App,
		plugin: any,
		settings: PluginSettings,
		saveCallback: () => Promise<void>,
		refreshCallback: () => Promise<void>
	) {
		super(app, plugin);
		this.settings = settings;
		this.saveCallback = saveCallback;
		this.refreshCallback = refreshCallback;
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

		// 元数据管理
		this.displayMetadataSettings();

		// 其他设置
		this.displayOtherSettings();
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
							await this.refreshCallback();
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon(ICONS.TRASH)
						.setTooltip("删除此文件夹")
						.onClick(async () => {
							this.settings.musicFolderPaths.splice(index, 1);
							await this.saveCallback();
							await this.refreshCallback();
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
	 * 显示元数据设置
	 */
	private displayMetadataSettings(): void {
		// 分隔线
		this.containerEl.createEl("hr");

		// 元数据管理标题
		this.containerEl.createEl("h3", { text: "元数据管理" });

		// 元数据统计
		const metadataCount = Object.keys(this.settings.metadata).length;

		new Setting(this.containerEl)
			.setName("已缓存的元数据")
			.setDesc(`当前缓存了 ${metadataCount} 个音频文件的元数据信息`)
			.addButton((button) => {
				button
					.setButtonText("刷新所有元数据")
					.setTooltip("重新扫描并提取所有音频文件的元数据")
					.onClick(async () => {
						button.setButtonText("正在刷新...");
						button.setDisabled(true);

						try {
							await this.refreshCallback();
							this.display(); // 刷新设置页面以显示新的统计信息
						} catch (error) {
							console.error("Failed to refresh metadata:", error);
						} finally {
							button.setButtonText("刷新所有元数据");
							button.setDisabled(false);
						}
					});
			});

		new Setting(this.containerEl)
			.setName("清空元数据缓存")
			.setDesc("清空所有缓存的元数据，下次播放时将重新提取")
			.addButton((button) => {
				button
					.setButtonText("清空缓存")
					.setWarning()
					.onClick(async () => {
						this.settings.metadata = {};
						await this.saveCallback();
						this.display();
					});
			});
	}

	/**
	 * 显示其他设置
	 */
	private displayOtherSettings(): void {
		// 分隔线
		this.containerEl.createEl("hr");

		// 其他设置标题
		this.containerEl.createEl("h3", { text: "其他设置" });

		// 收藏列表管理
		const favoritesCount = this.settings.favorites.length;

		new Setting(this.containerEl)
			.setName("收藏列表")
			.setDesc(`当前收藏了 ${favoritesCount} 首歌曲`)
			.addButton((button) => {
				button
					.setButtonText("清空收藏列表")
					.setWarning()
					.onClick(async () => {
						this.settings.favorites = [];
						await this.saveCallback();
						this.display();
					});
			});

		// 默认播放模式
		new Setting(this.containerEl)
			.setName("默认播放模式")
			.setDesc("设置插件启动时的默认播放模式")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("loop", "循环播放")
					.addOption("single", "单曲循环")
					.addOption("shuffle", "随机播放")
					.setValue(this.settings.playbackMode)
					.onChange(async (value) => {
						this.settings.playbackMode = value as any;
						await this.saveCallback();
					});
			});

		// 性能设置
		this.containerEl.createEl("hr");
		this.containerEl.createEl("h3", { text: "性能优化" });

		new Setting(this.containerEl)
			.setName("自动提取元数据")
			.setDesc("在添加新音乐文件时自动提取元数据（可能影响性能）")
			.addToggle((toggle) => {
				// 这里可以添加一个设置选项，暂时不实现
				toggle.setValue(true).onChange(async (value) => {
					// 未来可以实现这个功能
				});
			});

		// 使用说明
		this.containerEl.createEl("hr");
		this.containerEl.createEl("h3", { text: "使用说明" });

		const instructions = this.containerEl.createEl("div", {
			cls: "setting-item-description",
		});
		instructions.innerHTML = `
            <ul>
                <li><strong>支持的音频格式：</strong>MP3, FLAC, WAV, M4A, OGG</li>
                <li><strong>元数据支持：</strong>ID3v2 标签（标题、艺术家、专辑、封面）</li>
                <li><strong>播放控制：</strong>状态栏提供播放/暂停、上一首、下一首控制</li>
                <li><strong>播放列表：</strong>点击曲目名称可打开音乐中心管理播放列表</li>
                <li><strong>收藏功能：</strong>在音乐中心可以收藏喜欢的歌曲</li>
                <li><strong>拖拽功能：</strong>可以将播放列表中的歌曲拖拽到笔记中创建链接</li>
            </ul>
        `;
	}

	/**
	 * 更新设置引用
	 */
	updateSettings(settings: PluginSettings): void {
		this.settings = settings;
	}
}
