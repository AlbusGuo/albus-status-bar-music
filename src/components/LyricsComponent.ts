import { Component } from "obsidian";
import { LyricsDisplayOptions, ParsedLyrics } from "../types";

export class LyricsComponent extends Component {
	private containerEl: HTMLElement;
	private lyricsBar: HTMLElement;
	private lyricsText: HTMLElement;
	private dragHandle: HTMLElement;
	private currentLyrics: ParsedLyrics | null = null;
	private currentLineIndex: number = -1;
	private isVisible: boolean = false;
	private isDragging: boolean = false;
	private dragOffset = { x: 0, y: 0 };
	private displayOptions: LyricsDisplayOptions = {
		showTranslation: false,
		highlightCurrentLine: true,
		autoScroll: true,
		fontSize: 16,
	};

	constructor() {
		super();
		this.createLyricsBar();
		this.setupEventListeners();
	}

	/**
	 * 创建歌词栏
	 */
	private createLyricsBar(): void {
		// 创建独立的歌词栏，添加到 body
		this.lyricsBar = document.body.createDiv({
			cls: "music-lyrics-bar"
		});
		this.lyricsBar.hide();

		// 拖动手柄
		this.dragHandle = this.lyricsBar.createDiv({
			cls: "lyrics-drag-handle",
			text: "⋮⋮"
		});

		// 歌词文本容器
		this.lyricsText = this.lyricsBar.createDiv({
			cls: "lyrics-text-container",
			text: "暂无歌词"
		});

		// 设置初始位置
		this.setDefaultPosition();
	}

	/**
	 * 设置歌词栏默认位置
	 */
	private setDefaultPosition(): void {
		this.lyricsBar.style.position = "fixed";
		this.lyricsBar.style.top = "80px";
		this.lyricsBar.style.left = "50%";
		this.lyricsBar.style.transform = "translateX(-50%)";
		this.lyricsBar.style.zIndex = "1000";
	}

	/**
	 * 设置事件监听器
	 */
	private setupEventListeners(): void {
		// 拖拽功能
		this.dragHandle.addEventListener("mousedown", this.handleDragStart.bind(this));
		
		// 双击歌词文本跳转到当前位置
		this.lyricsText.addEventListener("dblclick", () => {
			if (this.currentLyrics && this.currentLineIndex >= 0) {
				const currentLine = this.currentLyrics.lines[this.currentLineIndex];
				this.emit("seek-to-time", currentLine.time);
			}
		});

		// 右键菜单 - 隐藏歌词栏
		this.lyricsBar.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.hide();
		});
	}

	/**
	 * 拖拽开始
	 */
	private handleDragStart(e: MouseEvent): void {
		this.isDragging = true;
		const rect = this.lyricsBar.getBoundingClientRect();
		this.dragOffset.x = e.clientX - rect.left;
		this.dragOffset.y = e.clientY - rect.top;

		document.addEventListener("mousemove", this.handleDragMove.bind(this));
		document.addEventListener("mouseup", this.handleDragEnd.bind(this));
		
		this.lyricsBar.addClass("dragging");
		e.preventDefault();
	}

	/**
	 * 拖拽移动
	 */
	private handleDragMove(e: MouseEvent): void {
		if (!this.isDragging) return;

		const x = e.clientX - this.dragOffset.x;
		const y = e.clientY - this.dragOffset.y;

		// 限制在屏幕范围内
		const maxX = window.innerWidth - this.lyricsBar.offsetWidth;
		const maxY = window.innerHeight - this.lyricsBar.offsetHeight;

		const constrainedX = Math.max(0, Math.min(x, maxX));
		const constrainedY = Math.max(0, Math.min(y, maxY));

		this.lyricsBar.style.left = constrainedX + "px";
		this.lyricsBar.style.top = constrainedY + "px";
		this.lyricsBar.style.transform = "none";
	}

	/**
	 * 拖拽结束
	 */
	private handleDragEnd(): void {
		this.isDragging = false;
		document.removeEventListener("mousemove", this.handleDragMove.bind(this));
		document.removeEventListener("mouseup", this.handleDragEnd.bind(this));
		this.lyricsBar.removeClass("dragging");
	}

	/**
	 * 设置歌词内容
	 */
	setLyrics(lyrics: ParsedLyrics | null): void {
		this.currentLyrics = lyrics;
		this.currentLineIndex = -1;
		this.renderLyrics();
	}

	/**
	 * 渲染歌词
	 */
	private renderLyrics(): void {
		this.lyricsEl.empty();

		if (!this.currentLyrics || this.currentLyrics.lines.length === 0) {
			this.showNoLyricsMessage();
			return;
		}

		// 创建歌词内容容器
		const contentEl = this.lyricsEl.createDiv({
			cls: "music-lyrics-content",
		});

		// 如果有歌曲信息，显示在顶部
		if (this.currentLyrics.title || this.currentLyrics.artist) {
			const headerEl = contentEl.createDiv({
				cls: "music-lyrics-header",
			});

			if (this.currentLyrics.title) {
				headerEl.createDiv({
					cls: "music-lyrics-title",
					text: this.currentLyrics.title,
				});
			}

			if (this.currentLyrics.artist) {
				headerEl.createDiv({
					cls: "music-lyrics-artist",
					text: this.currentLyrics.artist,
				});
			}
		}

		// 创建歌词行容器
		const linesEl = contentEl.createDiv({
			cls: "music-lyrics-lines",
		});

		// 渲染每一行歌词
		this.currentLyrics.lines.forEach((line, index) => {
			const lineEl = linesEl.createDiv({
				cls: "music-lyrics-line",
				attr: {
					"data-time": line.time.toString(),
					"data-index": index.toString(),
				},
			});

			// 歌词文本
			const textEl = lineEl.createDiv({
				cls: "music-lyrics-text",
				text: line.text,
			});

			// 如果有翻译且开启了翻译显示
			if (line.translation && this.displayOptions.showTranslation) {
				lineEl.createDiv({
					cls: "music-lyrics-translation",
					text: line.translation,
				});
			}

			// 添加点击事件，允许用户点击跳转到指定时间
			lineEl.addEventListener("click", () => {
				this.emit("seek-to-time", line.time);
			});
		});

		// 应用字体大小
		contentEl.style.fontSize = `${this.displayOptions.fontSize}px`;
	}

	/**
	 * 更新当前行
	 */
	updateCurrentLine(lineIndex: number): void {
		if (lineIndex === this.currentLineIndex) {
			return;
		}

		// 移除之前的高亮
		if (this.currentLineIndex >= 0) {
			const prevLine = this.lyricsEl.querySelector(
				`[data-index="${this.currentLineIndex}"]`
			);
			if (prevLine) {
				prevLine.removeClass("current");
			}
		}

		this.currentLineIndex = lineIndex;

		// 添加新的高亮
		if (lineIndex >= 0 && this.displayOptions.highlightCurrentLine) {
			const currentLine = this.lyricsEl.querySelector(
				`[data-index="${lineIndex}"]`
			) as HTMLElement;
			if (currentLine) {
				currentLine.addClass("current");

				// 自动滚动到当前行
				if (this.displayOptions.autoScroll) {
					this.scrollToLine(currentLine);
				}
			}
		}
	}

	/**
	 * 滚动到指定行
	 */
	private scrollToLine(lineEl: HTMLElement): void {
		const container = this.lyricsEl.querySelector(
			".music-lyrics-content"
		) as HTMLElement;
		if (!container) return;

		const containerRect = container.getBoundingClientRect();
		const lineRect = lineEl.getBoundingClientRect();

		// 计算目标滚动位置，将当前行居中显示
		const targetScrollTop =
			container.scrollTop +
			lineRect.top -
			containerRect.top -
			containerRect.height / 2 +
			lineRect.height / 2;

		// 平滑滚动
		container.scrollTo({
			top: targetScrollTop,
			behavior: "smooth",
		});
	}

	/**
	 * 设置显示选项
	 */
	setDisplayOptions(options: Partial<LyricsDisplayOptions>): void {
		this.displayOptions = { ...this.displayOptions, ...options };
		this.renderLyrics();
	}

	/**
	 * 获取当前显示选项
	 */
	getDisplayOptions(): LyricsDisplayOptions {
		return { ...this.displayOptions };
	}

	/**
	 * 切换翻译显示
	 */
	toggleTranslation(): void {
		this.displayOptions.showTranslation =
			!this.displayOptions.showTranslation;
		this.renderLyrics();
	}

	/**
	 * 切换自动滚动
	 */
	toggleAutoScroll(): void {
		this.displayOptions.autoScroll = !this.displayOptions.autoScroll;
	}

	/**
	 * 设置字体大小
	 */
	setFontSize(size: number): void {
		this.displayOptions.fontSize = Math.max(10, Math.min(24, size));
		const contentEl = this.lyricsEl.querySelector(
			".music-lyrics-content"
		) as HTMLElement;
		if (contentEl) {
			contentEl.style.fontSize = `${this.displayOptions.fontSize}px`;
		}
	}

	/**
	 * 显示/隐藏歌词面板
	 */
	toggle(): void {
		this.lyricsEl.toggleClass("hidden", !this.lyricsEl.hasClass("hidden"));
	}

	/**
	 * 清理资源
	 */
	onunload(): void {
		this.lyricsEl?.remove();
	}

	/**
	 * 触发自定义事件
	 */
	private emit(eventName: string, ...args: any[]): void {
		const event = new CustomEvent(`lyrics-${eventName}`, {
			detail: args,
		});
		this.containerEl.dispatchEvent(event);
	}
}
