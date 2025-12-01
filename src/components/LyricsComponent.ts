import { Component, setIcon } from "obsidian";
import { LyricsDisplayOptions, ParsedLyrics } from "../types";

export class LyricsComponent extends Component {
	private containerEl: HTMLElement | null = null; // 可选容器（用于 Hub 内嵌）
	private lyricsBar: HTMLElement;
	private lyricsText: HTMLElement;
	private dragHandle: HTMLElement;
	private lockButton: HTMLElement; // 锁定按钮
	private currentLyrics: ParsedLyrics | null = null;
	private currentLineIndex: number = -1;
	private _isVisible: boolean = false; // 改为私有变量
	private isDragging: boolean = false;
	private isLocked: boolean = false; // 锁定状态
	private dragOffset = { x: 0, y: 0 };
	private displayOptions: LyricsDisplayOptions = {
		showTranslation: false,
		highlightCurrentLine: true,
		autoScroll: true,
		fontSize: 16,
	};
	private isFloating: boolean = true; // 是否为悬浮模式
	private boundHandleDragMove: ((e: MouseEvent) => void) | null = null;
	private boundHandleDragEnd: ((e: MouseEvent) => void) | null = null;
	private boundHandleGlobalDoubleClick: ((e: MouseEvent) => void) | null = null;

	constructor(containerEl?: HTMLElement) {
		super();
		this.containerEl = containerEl || null;
		this.isFloating = !containerEl; // 如果没有传入容器，则为悬浮模式
		this.createLyricsBar();
		this.setupEventListeners();
	}

	/**
	 * 创建歌词栏
	 */
	private createLyricsBar(): void {
		if (this.isFloating) {
			// 悬浮模式：创建独立的歌词栏，添加到 body
			this.lyricsBar = document.body.createDiv({
				cls: "music-lyrics-bar floating-lyrics",
			});
			this.lyricsBar.hide();

			// 顶部控制栏
			const controlBar = this.lyricsBar.createDiv({
				cls: "lyrics-control-bar",
			});

			// 拖动手柄（仅悬浮模式）
			this.dragHandle = controlBar.createDiv({
				cls: "lyrics-drag-handle",
				text: "⋮⋮",
			});

			// 锁定按钮
			this.lockButton = controlBar.createDiv({
				cls: "lyrics-lock-button",
			});
			setIcon(this.lockButton, "lock-open");

			// 歌词文本容器
			this.lyricsText = this.lyricsBar.createDiv({
				cls: "lyrics-text-container",
				text: "暂无歌词",
			});

			// 设置初始位置
			this.setDefaultPosition();
		} else {
			// 内嵌模式：使用传入的容器
			this.lyricsBar = this.containerEl!;
			
			// 歌词文本容器
			this.lyricsText = this.lyricsBar.createDiv({
				cls: "lyrics-text-container music-lyrics-container",
			});
			
			// 内嵌模式不需要拖动手柄和锁定按钮
			this.dragHandle = this.lyricsText; // 占位，避免空引用
			this.lockButton = this.lyricsText; // 占位，避免空引用
		}
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
		if (!this.isFloating) {
			// 内嵌模式不需要拖拽和右键菜单
			return;
		}

		// 绑定拖拽处理函数
		this.boundHandleDragMove = this.handleDragMove.bind(this);
		this.boundHandleDragEnd = this.handleDragEnd.bind(this);
		this.boundHandleGlobalDoubleClick = this.handleGlobalDoubleClick.bind(this);

		// 拖拽功能（仅悬浮模式）
		this.dragHandle.addEventListener(
			"mousedown",
			this.handleDragStart.bind(this)
		);

		// 锁定按钮点击事件
		this.lockButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleLock();
		});

		// 双击解锁 - 使用全局双击检测
		if (this.boundHandleGlobalDoubleClick) {
			document.addEventListener("dblclick", this.boundHandleGlobalDoubleClick);
		}

		// 右键菜单 - 隐藏歌词栏（仅悬浮模式且未锁定时）
		this.lyricsBar.addEventListener("contextmenu", (e) => {
			if (!this.isLocked) {
				e.preventDefault();
				this.hide();
			}
		});
	}

	/**
	 * 处理全局双击事件（用于锁定状态下的解锁）
	 */
	private handleGlobalDoubleClick(e: MouseEvent): void {
		if (!this.isLocked || !this._isVisible) return;
		
		// 检查双击位置是否在歌词窗口范围内
		const rect = this.lyricsBar.getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		
		if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
			e.preventDefault();
			e.stopPropagation();
			this.toggleLock();
		}
	}

	/**
	 * 拖拽开始
	 */
	private handleDragStart(e: MouseEvent): void {
		if (this.isLocked) return; // 锁定时不允许拖拽
		
		this.isDragging = true;
		const rect = this.lyricsBar.getBoundingClientRect();
		this.dragOffset.x = e.clientX - rect.left;
		this.dragOffset.y = e.clientY - rect.top;

		document.addEventListener("mousemove", this.boundHandleDragMove!);
		document.addEventListener("mouseup", this.boundHandleDragEnd!);

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
		if (!this.isDragging) return;
		
		this.isDragging = false;
		document.removeEventListener("mousemove", this.boundHandleDragMove!);
		document.removeEventListener("mouseup", this.boundHandleDragEnd!);
		this.lyricsBar.removeClass("dragging");
	}

	/**
	 * 切换锁定状态
	 */
	private toggleLock(): void {
		this.isLocked = !this.isLocked;
		
		if (this.isLocked) {
			// 锁定状态
			this.lyricsBar.addClass("locked");
			this.lockButton.empty();
			setIcon(this.lockButton, "lock");
			this.dragHandle.style.cursor = "default";
			// 锁定时完全禁用所有鼠标交互，实现完全穿透
			// 注意：这样做后只能通过右键菜单或其他方式解锁
			// 但我们保留容器的事件监听，只在 CSS 层面穿透
		} else {
			// 解锁状态
			this.lyricsBar.removeClass("locked");
			this.lockButton.empty();
			setIcon(this.lockButton, "lock-open");
			this.dragHandle.style.cursor = "move";
		}
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
		this.lyricsText.empty();

		if (!this.currentLyrics || this.currentLyrics.lines.length === 0) {
			this.showNoLyricsMessage();
			return;
		}

		if (this.isFloating) {
			// 悬浮模式：只显示当前行和下一行（最多两行）
			this.renderFloatingLyrics();
		} else {
			// 内嵌模式：显示所有歌词
			this.renderFullLyrics();
		}
	}

	/**
	 * 渲染悬浮歌词（三行滚动模式）
	 */
	private renderFloatingLyrics(): void {
		const linesEl = this.lyricsText.createDiv({
			cls: "music-lyrics-lines floating-mode",
		});

		if (!this.currentLyrics || this.currentLyrics.lines.length === 0) {
			return;
		}

		const totalLines = this.currentLyrics.lines.length;
		const prevIndex = this.currentLineIndex - 1;
		const nextIndex = this.currentLineIndex + 1;
		
		// 渲染三行：上一行、当前行、下一行
		// 上一行（已播放的，半透明）
		if (prevIndex >= 0 && prevIndex < totalLines) {
			const prevLine = this.currentLyrics.lines[prevIndex];
			this.createLyricsLine(linesEl, prevLine, prevIndex, false, true);
		} else {
			// 占位空行
			const emptyLine = linesEl.createDiv({
				cls: "music-lyrics-line empty",
			});
			emptyLine.createDiv({
				cls: "music-lyrics-text",
				text: "",
			});
		}
		
		// 当前行（正在播放的，高亮）
		if (this.currentLineIndex >= 0 && this.currentLineIndex < totalLines) {
			const currentLine = this.currentLyrics.lines[this.currentLineIndex];
			this.createLyricsLine(linesEl, currentLine, this.currentLineIndex, true);
		} else if (this.currentLineIndex === -1 && totalLines > 0) {
			// 还没开始，显示第一句
			const firstLine = this.currentLyrics.lines[0];
			this.createLyricsLine(linesEl, firstLine, 0, false);
		} else {
			const emptyLine = linesEl.createDiv({
				cls: "music-lyrics-line empty",
			});
			emptyLine.createDiv({
				cls: "music-lyrics-text",
				text: "",
			});
		}
		
		// 下一行（即将播放的，半透明）
		if (nextIndex >= 0 && nextIndex < totalLines) {
			const nextLine = this.currentLyrics.lines[nextIndex];
			this.createLyricsLine(linesEl, nextLine, nextIndex, false);
		} else if (this.currentLineIndex === -1 && totalLines > 1) {
			// 还没开始，显示第二句
			const secondLine = this.currentLyrics.lines[1];
			this.createLyricsLine(linesEl, secondLine, 1, false);
		} else {
			const emptyLine = linesEl.createDiv({
				cls: "music-lyrics-line empty",
			});
			emptyLine.createDiv({
				cls: "music-lyrics-text",
				text: "♪",
			});
		}

		// 应用字体大小
		linesEl.style.fontSize = `${this.displayOptions.fontSize}px`;
	}

	/**
	 * 渲染完整歌词
	 */
	private renderFullLyrics(): void {
		// 创建歌词内容容器
		const contentEl = this.lyricsText.createDiv({
			cls: "music-lyrics-content",
		});

		// 如果有歌曲信息，显示在顶部
		if (this.currentLyrics!.title || this.currentLyrics!.artist) {
			const headerEl = contentEl.createDiv({
				cls: "music-lyrics-header",
			});

			if (this.currentLyrics!.title) {
				headerEl.createDiv({
					cls: "music-lyrics-title",
					text: this.currentLyrics!.title,
				});
			}

			if (this.currentLyrics!.artist) {
				headerEl.createDiv({
					cls: "music-lyrics-artist",
					text: this.currentLyrics!.artist,
				});
			}
		}

		// 创建歌词行容器
		const linesEl = contentEl.createDiv({
			cls: "music-lyrics-lines",
		});

		// 渲染每一行歌词
		this.currentLyrics!.lines.forEach((line, index) => {
			this.createLyricsLine(linesEl, line, index, false);
		});

		// 应用字体大小
		contentEl.style.fontSize = `${this.displayOptions.fontSize}px`;
	}

	/**
	 * 创建单行歌词元素
	 */
	private createLyricsLine(
		container: HTMLElement,
		line: { text: string; time: number; translation?: string },
		index: number,
		isCurrent: boolean,
		isPrev: boolean = false
	): HTMLElement {
		let cls = "music-lyrics-line";
		if (isCurrent) cls += " current";
		if (isPrev) cls += " prev";
		
		const lineEl = container.createDiv({
			cls: cls,
			attr: {
				"data-time": line.time.toString(),
				"data-index": index.toString(),
			},
		});

		// 歌词文本
		lineEl.createDiv({
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

		// 添加点击事件（非悬浮模式）
		if (!this.isFloating) {
			lineEl.addEventListener("click", () => {
				this.emit("seek-to-time", line.time);
			});
		}

		return lineEl;
	}

	/**
	 * 更新当前行
	 */
	updateCurrentLine(lineIndex: number): void {
		if (lineIndex === this.currentLineIndex) {
			return;
		}

		const prevLineIndex = this.currentLineIndex;
		this.currentLineIndex = lineIndex;

		if (this.isFloating) {
			// 悬浮模式：使用动画切换
			this.updateFloatingLyricsWithAnimation(prevLineIndex, lineIndex);
		} else {
			// 内嵌模式：更新高亮
			// 移除之前的高亮
			if (prevLineIndex >= 0) {
				const prevLine = this.lyricsText.querySelector(
					`[data-index="${prevLineIndex}"]`
				);
				if (prevLine) {
					prevLine.removeClass("current");
				}
			}

			// 添加新的高亮
			if (lineIndex >= 0 && this.displayOptions.highlightCurrentLine) {
				const currentLine = this.lyricsText.querySelector(
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
	}

	/**
	 * 带动画的更新悬浮歌词
	 */
	private updateFloatingLyricsWithAnimation(prevIndex: number, newIndex: number): void {
		if (!this.currentLyrics || this.currentLyrics.lines.length === 0) {
			this.lyricsText.empty();
			this.renderFloatingLyrics();
			return;
		}

		const container = this.lyricsText.querySelector(".music-lyrics-lines") as HTMLElement;
		
		if (!container) {
			this.lyricsText.empty();
			this.renderFloatingLyrics();
			return;
		}

		const totalLines = this.currentLyrics.lines.length;
		
		// 先添加第四行（新的下一行）在底部
		const nextNextIdx = newIndex + 1;
		if (nextNextIdx >= 0 && nextNextIdx < totalLines) {
			const nextLine = this.currentLyrics.lines[nextNextIdx];
			this.createLyricsLine(container, nextLine, nextNextIdx, false);
		} else if (newIndex === -1 && totalLines > 1) {
			const secondLine = this.currentLyrics.lines[1];
			this.createLyricsLine(container, secondLine, 1, false);
		} else {
			const emptyLine = container.createDiv({
				cls: "music-lyrics-line empty",
			});
			emptyLine.createDiv({ cls: "music-lyrics-text", text: "♪" });
		}
		
		// 触发向上滑动动画
		requestAnimationFrame(() => {
			container.addClass("lyrics-slide-up");
		});
		
		// 动画完成后处理
		setTimeout(() => {
			if (!this.currentLyrics) return;
			
			// 移除第一行
			const firstLine = container.querySelector(".music-lyrics-line");
			if (firstLine) {
				firstLine.remove();
			}
			
			// 更新样式类
			const lines = container.querySelectorAll(".music-lyrics-line");
			if (lines.length >= 3) {
				lines[0].removeClass("current");
				lines[0].addClass("prev");
				
				lines[1].removeClass("prev");
				lines[1].addClass("current");
				
				lines[2].removeClass("current");
				lines[2].removeClass("prev");
			}
			
			// 立即重置位置（无过渡）
			container.removeClass("lyrics-slide-up");
			
			container.style.fontSize = `${this.displayOptions.fontSize}px`;
		}, 500);
	}

	/**
	 * 滚动到指定行
	 */
	private scrollToLine(lineEl: HTMLElement): void {
		const container = this.lyricsText.querySelector(
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
		const contentEl = this.lyricsText.querySelector(
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
		this.lyricsText.toggleClass(
			"hidden",
			!this.lyricsText.hasClass("hidden")
		);
	}

	/**
	 * 清理资源
	 */
	onunload(): void {
		// 移除事件监听器
		if (this.boundHandleDragMove) {
			document.removeEventListener("mousemove", this.boundHandleDragMove);
		}
		if (this.boundHandleDragEnd) {
			document.removeEventListener("mouseup", this.boundHandleDragEnd);
		}
		
		// 移除全局双击监听
		if (this.boundHandleGlobalDoubleClick) {
			document.removeEventListener("dblclick", this.boundHandleGlobalDoubleClick);
		}
		
		if (this.isFloating && this.lyricsBar) {
			this.lyricsBar.remove();
		}
	}

	/**
	 * 显示歌词栏
	 */
	show(): void {
		this._isVisible = true;
		if (this.isFloating) {
			this.lyricsBar.show();
		}
	}

	/**
	 * 隐藏歌词栏
	 */
	hide(): void {
		this._isVisible = false;
		if (this.isFloating) {
			this.lyricsBar.hide();
		}
	}

	/**
	 * 检查是否可见
	 */
	isVisible(): boolean {
		return this._isVisible;
	}

	/**
	 * 获取当前歌词
	 */
	getCurrentLyrics(): ParsedLyrics | null {
		return this.currentLyrics;
	}

	/**
	 * 获取当前行索引
	 */
	getCurrentLineIndex(): number {
		return this.currentLineIndex;
	}

	/**
	 * 显示无歌词消息
	 */
	private showNoLyricsMessage(): void {
		this.lyricsText.empty();
		this.lyricsText.createDiv({
			cls: "no-lyrics-message",
			text: "暂无歌词",
		});
	}

	/**
	 * 触发自定义事件
	 */
	private emit(eventName: string, ...args: any[]): void {
		const event = new CustomEvent(`lyrics-${eventName}`, {
			detail: args,
		});
		
		// 如果有容器，在容器上触发事件；否则在歌词栏上触发
		const target = this.containerEl || this.lyricsBar;
		if (target) {
			target.dispatchEvent(event);
		}
	}
}
