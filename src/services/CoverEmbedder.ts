import { App, TFile } from "obsidian";
import { TrackMetadata } from "../types";

/**
 * 封面嵌入服务
 * 将下载的封面嵌入到音频文件的元数据中
 */
export class CoverEmbedder {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 将封面嵌入到音频文件
	 * 注意：在浏览器环境中，我们无法直接修改文件系统
	 * 这个服务主要用于标记需要嵌入封面的文件
	 */
	async embedCoverToTrack(filePath: string, coverData: string): Promise<boolean> {
		try {
			console.log(`CoverEmbedder: Marking cover for embedding to ${filePath}`);
			
			// 在Obsidian插件环境中，我们无法直接修改音频文件
			// 但我们可以存储这个信息，供后续处理或提示用户
			
			// 将封面数据存储到插件的缓存中
			const cacheKey = `cover_cache_${filePath}`;
			localStorage.setItem(cacheKey, coverData);
			
			// 标记这个文件需要封面更新
			const updateKey = `cover_update_needed_${filePath}`;
			localStorage.setItem(updateKey, 'true');
			
			console.log(`CoverEmbedder: Cover cached for ${filePath}`);
			return true;
		} catch (error) {
			console.error(`CoverEmbedder: Failed to embed cover to ${filePath}:`, error);
			return false;
		}
	}

	/**
	 * 检查文件是否有待嵌入的封面
	 */
	hasPendingCoverUpdate(filePath: string): boolean {
		const updateKey = `cover_update_needed_${filePath}`;
		return localStorage.getItem(updateKey) === 'true';
	}

	/**
	 * 获取缓存的封面数据
	 */
	getCachedCover(filePath: string): string | null {
		const cacheKey = `cover_cache_${filePath}`;
		return localStorage.getItem(cacheKey);
	}

	/**
	 * 清除封面缓存
	 */
	clearCoverCache(filePath: string): void {
		const cacheKey = `cover_cache_${filePath}`;
		const updateKey = `cover_update_needed_${filePath}`;
		
		localStorage.removeItem(cacheKey);
		localStorage.removeItem(updateKey);
	}

	/**
	 * 获取所有待更新封面的文件列表
	 */
	getPendingCoverUpdates(): string[] {
		const pendingFiles: string[] = [];
		
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith('cover_update_needed_')) {
				const filePath = key.replace('cover_update_needed_', '');
				pendingFiles.push(filePath);
			}
		}
		
		return pendingFiles;
	}

	/**
	 * 生成封面更新报告
	 */
	generateCoverUpdateReport(): { total: number; files: string[] } {
		const pendingFiles = this.getPendingCoverUpdates();
		
		return {
			total: pendingFiles.length,
			files: pendingFiles
		};
	}

	/**
	 * 为用户提供封面更新指导
	 */
	generateUpdateInstructions(): string {
		const pending = this.getPendingCoverUpdates();
		
		if (pending.length === 0) {
			return '所有音乐文件的封面都是最新的！';
		}
		
		return `
发现 ${pending.length} 个文件需要更新封面：

${pending.map(file => `• ${file.split('/').pop()}`).join('\n')}

由于浏览器安全限制，无法直接修改音频文件。
建议使用以下方法之一：

1. 使用专业音频标签编辑器（如 MP3Tag、MusicBrainz Picard）
2. 使用支持封面管理的音乐播放器
3. 使用命令行工具（如 ffmpeg、eyeD3）

插件已将封面数据缓存，您可以手动应用这些封面。
		`.trim();
	}

	/**
	 * 创建封面更新数据的导出
	 */
	exportCoverUpdates(): string {
		const pending = this.getPendingCoverUpdates();
		const exportData: any[] = [];
		
		for (const filePath of pending) {
			const coverData = this.getCachedCover(filePath);
			if (coverData) {
				exportData.push({
					filePath,
					coverData,
					timestamp: new Date().toISOString()
				});
			}
		}
		
		return JSON.stringify(exportData, null, 2);
	}

	/**
	 * 导入封面更新数据
	 */
	importCoverUpdates(jsonData: string): boolean {
		try {
			const importData = JSON.parse(jsonData);
			
			if (!Array.isArray(importData)) {
				throw new Error('Invalid data format');
			}
			
			for (const item of importData) {
				if (item.filePath && item.coverData) {
					const cacheKey = `cover_cache_${item.filePath}`;
					const updateKey = `cover_update_needed_${item.filePath}`;
					
					localStorage.setItem(cacheKey, item.coverData);
					localStorage.setItem(updateKey, 'true');
				}
			}
			
			console.log(`CoverEmbedder: Imported ${importData.length} cover updates`);
			return true;
		} catch (error) {
			console.error('CoverEmbedder: Failed to import cover updates:', error);
			return false;
		}
	}
}