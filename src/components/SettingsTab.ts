import { App, PluginSettingTab, Setting } from "obsidian";
import { PluginSettings } from "../types";
import { ICONS } from "../utils/constants";

export class SettingsTab extends PluginSettingTab {
	private settings: PluginSettings;
	private saveCallback: () => Promise<void>;
	private metadataStatsContainer: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: any,
		settings: PluginSettings,
		saveCallback: () => Promise<void>
	) {
		super(app, plugin);
		this.settings = settings;
		this.saveCallback = saveCallback;
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
			cls: "metadata-stats-container"
		});

		// 元数据统计
		this.updateMetadataStats(this.metadataStatsContainer);
	}

	/**
	 * 更新元数据统计显示
	 */
	private updateMetadataStats(container: HTMLElement): void {
		container.empty();
		
		const metadataCount = Object.keys(this.settings.metadata).length;

		new Setting(container)
			.setName("已缓存的元数据")
			.setDesc(`当前缓存了 ${metadataCount} 个音频文件的元数据信息`);
	}

	

	/**
	 * 更新设置引用
	 */
	updateSettings(settings: PluginSettings): void {
		this.settings = settings;
		
		// 更新元数据统计显示
		if (this.metadataStatsContainer) {
			this.updateMetadataStats(this.metadataStatsContainer);
		}
	}
}
