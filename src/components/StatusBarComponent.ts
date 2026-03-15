import { setIcon } from "obsidian";
import { LyricsDisplayState, MusicTrack } from "../types";
import { CSS_CLASSES, ICONS } from "../utils/constants";

export class StatusBarComponent {
	private containerEl: HTMLElement;
	private prevButton: HTMLButtonElement;
	private playPauseButton: HTMLButtonElement;
	private nextButton: HTMLButtonElement;
	private lyricsButton: HTMLButtonElement;
	private trackButton: HTMLButtonElement;
	private trackNameEl: HTMLSpanElement;
	private progressEl: HTMLDivElement;
	private currentTrack: MusicTrack | null = null;

	private events: {
		onPrevious?: () => void;
		onPlayPause?: () => void;
		onNext?: () => void;
		onLyricsToggle?: () => void;
		onTrackClick?: () => void;
	} = {};

	constructor(statusBarItem: HTMLElement) {
		this.containerEl = statusBarItem;
		this.createElements();
		this.setupEventListeners();
	}

	/**
	 * 创建DOM元素
	 */
	private createElements(): void {
		this.containerEl.addClass(CSS_CLASSES.STATUSBAR);

		// 上一首按钮
		this.prevButton = this.containerEl.createEl("button", {
			cls: CSS_CLASSES.BUTTON,
		});
		setIcon(this.prevButton, ICONS.SKIP_BACK);

		// 播放/暂停按钮
		this.playPauseButton = this.containerEl.createEl("button", {
			cls: CSS_CLASSES.BUTTON,
		});
		setIcon(this.playPauseButton, ICONS.PLAY);

		// 下一首按钮
		this.nextButton = this.containerEl.createEl("button", {
			cls: CSS_CLASSES.BUTTON,
		});
		setIcon(this.nextButton, ICONS.SKIP_FORWARD);

		// 歌词按钮
		this.lyricsButton = this.containerEl.createEl("button", {
			cls: CSS_CLASSES.BUTTON + " statusbar-lyrics-button",
		});
		setIcon(this.lyricsButton, ICONS.TEXT);

		// 曲目按钮
		this.trackButton = this.containerEl.createEl("button", {
			cls: CSS_CLASSES.TRACK_BUTTON,
		});

		// 曲目名称
		this.trackNameEl = this.trackButton.createEl("span", {
			text: "播放列表",
		});

		// 进度条
		this.progressEl = this.trackButton.createEl("div", {
			cls: CSS_CLASSES.PROGRESS,
		});
	}

	/**
	 * 设置事件监听器
	 */
	private setupEventListeners(): void {
		this.prevButton.addEventListener("click", () => {
			this.events.onPrevious?.();
		});

		this.playPauseButton.addEventListener("click", () => {
			this.events.onPlayPause?.();
		});

		this.nextButton.addEventListener("click", () => {
			this.events.onNext?.();
		});

		this.lyricsButton.addEventListener("click", () => {
			this.events.onLyricsToggle?.();
		});

		this.trackButton.addEventListener("click", () => {
			this.events.onTrackClick?.();
		});
	}

	/**
	 * 注册事件监听器
	 */
	on(event: string, callback: () => void): void {
		(this.events as any)[event] = callback;
	}

	/**
	 * 更新播放状态
	 */
	updatePlayState(isPlaying: boolean): void {
		const icon = isPlaying ? ICONS.PAUSE : ICONS.PLAY;
		setIcon(this.playPauseButton, icon);
	}

	/**
	 * 更新当前曲目
	 */
	updateTrack(track: MusicTrack | null): void {
		this.currentTrack = track;
		this.updateDisplayText();
	}

	/**
	 * 更新显示文本（根据模式显示歌曲名或歌词）
	 */
	private updateDisplayText(): void {
		if (this.currentTrack) {
			const displayName =
				this.currentTrack.metadata?.title || this.currentTrack.name;
			this.trackNameEl.setText(displayName);
		} else {
			this.trackNameEl.setText("播放列表");
		}
		this.checkAndApplyScrolling();
	}

	/**
	 * 更新进度
	 */
	updateProgress(progress: number): void {
		const progressPercent = Math.max(0, Math.min(100, progress * 100));
		this.progressEl.style.width = `${progressPercent}%`;
	}

	/**
	 * 检查并应用滚动效果
	 */
	private checkAndApplyScrolling(): void {
		requestAnimationFrame(() => {
			const buttonWidth = this.trackButton.clientWidth;
			const textWidth = this.trackNameEl.scrollWidth;

			if (textWidth > buttonWidth) {
				this.trackNameEl.addClass(CSS_CLASSES.IS_SCROLLING);
				this.trackNameEl.style.setProperty(
					"--button-width",
					`${buttonWidth}px`
				);
			} else {
				this.trackNameEl.removeClass(CSS_CLASSES.IS_SCROLLING);
			}
		});
	}

	/**
	 * 设置按钮状态
	 */
	setButtonEnabled(button: "prev" | "play" | "next", enabled: boolean): void {
		const buttonEl = this.getButtonElement(button);
		if (buttonEl) {
			buttonEl.disabled = !enabled;
			buttonEl.style.opacity = enabled ? "1" : "0.5";
		}
	}

	/**
	 * 获取按钮元素
	 */
	private getButtonElement(
		button: "prev" | "play" | "next"
	): HTMLButtonElement | null {
		switch (button) {
			case "prev":
				return this.prevButton;
			case "play":
				return this.playPauseButton;
			case "next":
				return this.nextButton;
			default:
				return null;
		}
	}

	/**
	 * 显示或隐藏控制按钮
	 */
	setControlButtonsVisible(visible: boolean): void {
		if (visible) {
			this.prevButton.show();
			this.playPauseButton.show();
			this.nextButton.show();
			this.lyricsButton.show();
		} else {
			this.prevButton.hide();
			this.playPauseButton.hide();
			this.nextButton.hide();
			this.lyricsButton.hide();
		}
	}

	/**
	 * 设置歌词按钮激活状态
	 */
	setLyricsButtonState(state: LyricsDisplayState): void {
		this.lyricsButton.removeClass("active", "active-floating");
		if (state === "floating") {
			this.lyricsButton.addClass("active");
		}
	}

	/**
	 * 设置歌词按钮激活状态
	 */
	setLyricsButtonActive(active: boolean): void {
		if (active) {
			this.lyricsButton.addClass("active");
		} else {
			this.lyricsButton.removeClass("active");
		}
	}

	/**
	 * 获取容器元素
	 */
	getElement(): HTMLElement {
		return this.containerEl;
	}

	/**
	 * 清理
	 */
	cleanup(): void {
		this.containerEl.empty();
		this.events = {};
	}
}
