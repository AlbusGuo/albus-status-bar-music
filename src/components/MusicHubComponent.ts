import { setIcon } from "obsidian";
import { MusicTrack, PlaybackMode } from "../types";
import { CSS_CLASSES, ICONS, UI_CONSTANTS } from "../utils/constants";
import { clamp, formatTime } from "../utils/helpers";
import { VinylPlayer } from "./VinylPlayer";

export class MusicHubComponent {
	private containerEl: HTMLElement;
	private functionBar: HTMLElement;
	private favButton: HTMLButtonElement;
	private refreshButton: HTMLButtonElement;
	private categorySelect: HTMLSelectElement;
	private modeButton: HTMLButtonElement;
	private controlsEl: HTMLElement;
	private leftVinylButton: HTMLButtonElement;
	private rightVinylButton: HTMLButtonElement;
	private progressContainer: HTMLElement;
	private progressFill: HTMLElement;
	private progressThumb: HTMLElement;
	private timeDisplay: HTMLElement;
	private playlistEl: HTMLUListElement;
	private vinylPlayer: VinylPlayer;

	private isDragging = false;
	private isVisible = false;
	private isHiding = false;
	private hideTimeout: NodeJS.Timeout | null = null;

	private events: {
		onFavoriteToggle?: () => void;
		onRefresh?: () => void;
		onCategoryChange?: (category: string) => void;
		onModeToggle?: () => void;
		onPrevious?: () => void;
		onNext?: () => void;
		onSeek?: (percent: number) => void;
		onTrackSelect?: (track: MusicTrack) => void;
		onHide?: () => void;
		onVinylPlayPause?: () => void;
	} = {};

	constructor() {
		this.createElements();
		this.setupEventListeners();
	}

	/**
	 * 创建DOM元素
	 */
	private createElements(): void {
		this.containerEl = document.body.createEl("div", {
			cls: CSS_CLASSES.HUB_CONTAINER,
		});
		this.containerEl.hide();

		// 功能按钮栏
		this.createFunctionBar();

		// 控制区域
		this.createControls();

		// 播放列表
		this.playlistEl = this.containerEl.createEl("ul", {
			cls: "hub-playlist",
		});
	}

	/**
	 * 创建功能按钮栏
	 */
	private createFunctionBar(): void {
		this.functionBar = this.containerEl.createEl("div", {
			cls: "hub-function-bar",
		});

		// 收藏按钮
		this.favButton = this.functionBar.createEl("button", {
			cls: "hub-function-button",
		});
		setIcon(this.favButton, ICONS.HEART);

		// 刷新按钮
		this.refreshButton = this.functionBar.createEl("button", {
			cls: "hub-function-button",
		});
		setIcon(this.refreshButton, ICONS.REFRESH);

		// 分类选择器
		this.categorySelect = this.functionBar.createEl("select", {
			cls: "hub-function-select",
		});

		// 播放模式按钮
		this.modeButton = this.functionBar.createEl("button", {
			cls: "hub-function-button",
		});
		setIcon(this.modeButton, ICONS.REPEAT);
	}

	/**
	 * 创建控制区域
	 */
	private createControls(): void {
		this.controlsEl = this.containerEl.createEl("div", {
			cls: "hub-controls",
		});

		// 唱片切换容器
		const vinylSwitcherContainer = this.controlsEl.createEl("div", {
			cls: "hub-vinyl-switcher",
		});

		// 左侧唱片按钮
		this.leftVinylButton = vinylSwitcherContainer.createEl("button", {
			cls: "hub-side-vinyl hub-left-vinyl",
		});
		this.leftVinylButton.innerHTML = `
			<div class="hub-side-vinyl-disc">
				<div class="hub-side-vinyl-cover"></div>
			</div>
		`;

		// 中间黑胶唱片播放器容器
		const vinylContainer = vinylSwitcherContainer.createEl("div", {
			cls: "hub-vinyl-container",
		});
		this.vinylPlayer = new VinylPlayer(vinylContainer);
		
		// 右侧唱片按钮
		this.rightVinylButton = vinylSwitcherContainer.createEl("button", {
			cls: "hub-side-vinyl hub-right-vinyl",
		});
		this.rightVinylButton.innerHTML = `
			<div class="hub-side-vinyl-disc">
				<div class="hub-side-vinyl-cover"></div>
			</div>
		`;
		
		// 连接黑胶唱片播放器事件
		this.connectVinylEvents();

		// 进度和时间容器
		const progressTimeContainer = this.controlsEl.createEl("div", {
			cls: "hub-progress-time-container",
		});

		// 进度条容器
		this.progressContainer = progressTimeContainer.createEl("div", {
			cls: "hub-progress-container",
		});

		this.progressFill = this.progressContainer.createEl("div", {
			cls: "hub-progress-fill",
		});

		this.progressThumb = this.progressContainer.createEl("div", {
			cls: "hub-progress-thumb",
		});

		// 时间显示
		this.timeDisplay = progressTimeContainer.createEl("div", {
			cls: "hub-time-display",
			text: "--:-- / --:--",
		});
	}

	/**
	 * 设置事件监听器
	 */
	private setupEventListeners(): void {
		// 功能按钮事件
		this.favButton.addEventListener("click", () => {
			this.events.onFavoriteToggle?.();
		});

		this.refreshButton.addEventListener("click", () => {
			this.events.onRefresh?.();
		});

		this.categorySelect.addEventListener("change", () => {
			this.events.onCategoryChange?.(this.categorySelect.value);
		});

		this.modeButton.addEventListener("click", () => {
			this.events.onModeToggle?.();
		});

		// 左右唱片按钮事件
		this.leftVinylButton.addEventListener("click", () => {
			this.events.onPrevious?.();
		});

		this.rightVinylButton.addEventListener("click", () => {
			this.events.onNext?.();
		});

		// 进度条拖拽事件
		this.progressContainer.addEventListener(
			"mousedown",
			this.handleDragStart
		);

		// 点击外部关闭
		document.addEventListener("click", this.handleDocumentClick, {
			capture: true,
		});
	}

	/**
	 * 处理拖拽开始
	 */
	private handleDragStart = (e: MouseEvent): void => {
		this.isDragging = true;
		this.containerEl.addClass(CSS_CLASSES.IS_DRAGGING);

		this.seek(e);

		document.addEventListener("mousemove", this.handleDragMove);
		document.addEventListener("mouseup", this.handleDragEnd);

		e.preventDefault();
	};

	/**
	 * 处理拖拽移动
	 */
	private handleDragMove = (e: MouseEvent): void => {
		if (this.isDragging) {
			this.updateVisualProgress(e);
		}
	};

	/**
	 * 处理拖拽结束
	 */
	private handleDragEnd = (e: MouseEvent): void => {
		if (this.isDragging) {
			this.isDragging = false;
			this.containerEl.removeClass(CSS_CLASSES.IS_DRAGGING);

			this.seek(e);

			document.removeEventListener("mousemove", this.handleDragMove);
			document.removeEventListener("mouseup", this.handleDragEnd);
		}
	};

	/**
	 * 跳转到指定位置
	 */
	private seek(e: MouseEvent): void {
		const rect = this.progressContainer.getBoundingClientRect();
		const progress = clamp((e.clientX - rect.left) / rect.width, 0, 1);
		this.events.onSeek?.(progress);
	}

	/**
	 * 更新视觉进度
	 */
	private updateVisualProgress(e: MouseEvent): void {
		const rect = this.progressContainer.getBoundingClientRect();
		const progress = clamp((e.clientX - rect.left) / rect.width, 0, 1);
		const percent = progress * 100;

		this.progressFill.style.width = `${percent}%`;
		this.progressThumb.style.left = `calc(${percent}% - 5px)`;
	}

	/**
	 * 处理文档点击（用于关闭Hub）
	 */
	private handleDocumentClick = (e: Event): void => {
		if (!this.isVisible) return;

		const target = e.target as HTMLElement;
		if (!this.containerEl.contains(target)) {
			this.hide();
		}
	};

	/**
	 * 注册事件监听器
	 */
	on(event: string, callback: (...args: any[]) => void): void {
		(this.events as any)[event] = callback;
	}

	/**
	 * 显示Hub
	 */
	show(anchorElement: HTMLElement): void {
		const buttonRect = anchorElement.getBoundingClientRect();
		const hubWidth = 380; // 与CSS中的容器宽度一致
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;

		// 先显示容器以获取实际高度
		this.containerEl.show();
		const hubHeight = this.containerEl.offsetHeight;

		// 计算水平位置
		let hubLeft = buttonRect.left;
		if (hubLeft + hubWidth > screenWidth) {
			hubLeft = buttonRect.right - hubWidth;
		}
		hubLeft = Math.max(10, hubLeft); // 确保不超出左边界，至少留10px边距

		// 计算垂直位置 - 优先显示在按钮上方
		let hubTop = buttonRect.top - hubHeight - 10; // 10px 间距
		
		// 如果上方空间不足，显示在下方
		if (hubTop < 10) {
			hubTop = buttonRect.bottom + 10;
		}

		// 确保不超出屏幕底部，留至少10px边距
		if (hubTop + hubHeight > screenHeight - 10) {
			hubTop = screenHeight - hubHeight - 10;
		}

		// 最终确保不超出顶部
		hubTop = Math.max(10, hubTop);

		this.containerEl.style.top = `${hubTop}px`;
		this.containerEl.style.left = `${hubLeft}px`;
		this.containerEl.style.bottom = 'auto'; // 取消bottom设置

		this.isVisible = true;
	}

	/**
	 * 隐藏Hub
	 */
	hide(): void {
		// 设置隐藏标志，防止立即重新打开
		this.isHiding = true;
		
		// 清除之前的超时
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
		}
		
		this.containerEl.hide();
		this.isVisible = false;
		this.events.onHide?.();
		
		// 200ms后清除隐藏标志
		this.hideTimeout = setTimeout(() => {
			this.isHiding = false;
		}, 200);
	}

	/**
	 * 切换显示状态
	 */
	toggle(anchorElement: HTMLElement): void {
		// 如果正在隐藏过程中，忽略这次点击
		if (this.isHiding) {
			console.log('MusicHub: Ignoring toggle - currently hiding');
			return;
		}
		
		if (this.isVisible) {
			console.log('MusicHub: Hiding music hub (currently visible)');
			this.hide();
		} else {
			console.log('MusicHub: Showing music hub (currently hidden)');
			this.show(anchorElement);
		}
	}

	/**
	 * 更新收藏按钮状态
	 */
	updateFavoriteButton(isFavorite: boolean): void {
		if (isFavorite) {
			this.favButton.addClass(CSS_CLASSES.IS_FAVORITE);
		} else {
			this.favButton.removeClass(CSS_CLASSES.IS_FAVORITE);
		}
	}

	/**
	 * 更新播放模式图标
	 */
	updateModeIcon(mode: PlaybackMode): void {
		const iconMap = {
			loop: ICONS.REPEAT,
			single: ICONS.REPEAT_ONE,
			shuffle: ICONS.SHUFFLE,
		};
		setIcon(this.modeButton, iconMap[mode]);
	}

	/**
	 * 更新当前播放曲目
	 */
	updateCurrentTrack(track: MusicTrack | null): void {
		this.vinylPlayer.setTrack(track);
		// 更新左右唱片的封面将在主插件中处理
	}

	/**
	 * 更新播放状态
	 */
	updatePlayState(isPlaying: boolean): void {
		this.vinylPlayer.setPlaying(isPlaying);
	}

	/**
	 * 只更新当前播放状态，不重新渲染整个列表
	 */
	updateCurrentPlayingTrack(track: MusicTrack | null): void {
		// 移除所有播放状态
		this.playlistEl.querySelectorAll(`.${CSS_CLASSES.IS_PLAYING}`).forEach(item => {
			item.removeClass(CSS_CLASSES.IS_PLAYING);
		});

		// 为当前播放项添加播放状态
		if (track) {
			const currentItem = this.playlistEl.querySelector(`[data-track-id="${track.id}"]`);
			if (currentItem) {
				currentItem.addClass(CSS_CLASSES.IS_PLAYING);
			}
		}
	}

	/**
	 * 更新左右唱片按钮的封面
	 */
	updateSideVinyls(prevTrack: MusicTrack | null, nextTrack: MusicTrack | null): void {
		// 更新左侧唱片（上一首）
		this.updateSideVinyl(this.leftVinylButton, prevTrack);
		
		// 更新右侧唱片（下一首）
		this.updateSideVinyl(this.rightVinylButton, nextTrack);
	}

	/**
	 * 更新单个侧边唱片
	 */
	private updateSideVinyl(button: HTMLButtonElement, track: MusicTrack | null): void {
		const coverEl = button.querySelector('.hub-side-vinyl-cover') as HTMLElement;
		if (!coverEl) return;

		if (track && track.metadata?.cover) {
			coverEl.style.backgroundImage = `url(${track.metadata.cover})`;
			coverEl.style.opacity = '1';
		} else {
			coverEl.style.backgroundImage = '';
			coverEl.style.opacity = '0';
		}
	}

	/**
	 * 连接黑胶唱片播放器事件
	 */
	private connectVinylEvents(): void {
		this.vinylPlayer.on("onPlayPause", () => {
			this.events.onVinylPlayPause?.();
		});
	}

	/**
	 * 更新分类选择器
	 */
	updateCategorySelector(
		categories: { value: string; label: string }[]
	): void {
		const currentValue = this.categorySelect.value;
		this.categorySelect.empty();

		categories.forEach((category) => {
			const option = this.categorySelect.createEl("option", {
				value: category.value,
				text: category.label,
			});
		});

		// 恢复之前的选择
		if (categories.some((cat) => cat.value === currentValue)) {
			this.categorySelect.value = currentValue;
		} else {
			this.categorySelect.value = "all";
		}
	}

	/**
	 * 更新进度显示
	 */
	updateProgress(currentTime: number, duration: number): void {
		if (this.isDragging) return;

		if (!isFinite(duration) || isNaN(duration)) {
			this.timeDisplay.setText("--:-- / --:--");
			this.progressFill.style.width = "0%";
			this.progressThumb.style.left = "-5px";
			return;
		}

		const progress = (currentTime / duration) * 100;
		this.progressFill.style.width = `${progress}%`;
		this.progressThumb.style.left = `calc(${progress}% - 5px)`;

		const currentTimeStr = formatTime(currentTime);
		const durationStr = formatTime(duration);
		this.timeDisplay.setText(`${currentTimeStr} / ${durationStr}`);
	}

	/**
	 * 渲染播放列表
	 */
	renderPlaylist(
		tracks: MusicTrack[],
		currentTrack: MusicTrack | null,
		isMetadataInitialized: boolean = true
	): void {
		this.playlistEl.empty();

		// 如果元数据未初始化，显示加载状态
		if (!isMetadataInitialized) {
			this.playlistEl.createEl("li", {
				text: "正在加载音乐库...",
				cls: "playlist-loading",
			});
			return;
		}

		if (tracks.length === 0) {
			this.playlistEl.createEl("li", {
				text: "此列表为空",
				cls: "playlist-empty",
			});
			return;
		}

		tracks.forEach((track) => {
			const li = this.playlistEl.createEl("li", {
				cls: "playlist-item",
			});
			
			// 添加track ID用于后续状态更新
			li.setAttribute("data-track-id", track.id.toString());

			if (currentTrack && track.id === currentTrack.id) {
				li.addClass(CSS_CLASSES.IS_PLAYING);
			}

			// 创建内容容器
			const content = li.createEl("div", {
				cls: "playlist-item-content",
			});

			// 封面
			const coverContainer = content.createEl("div", {
				cls: "playlist-item-cover",
			});
			
			if (track.metadata?.cover) {
				const coverImg = coverContainer.createEl("img", {
					cls: "playlist-cover-img",
				});
				coverImg.src = track.metadata.cover;
				coverImg.alt = "专辑封面";

				// 优化加载逻辑：先检查图片是否已缓存
				const testImg = new Image();
				testImg.onload = () => {
					// 图片已缓存，直接显示
					coverImg.style.opacity = "1";
				};
				testImg.onerror = () => {
					// 图片加载失败，显示默认图标
					coverContainer.empty();
					setIcon(coverContainer, ICONS.MUSIC);
				};
				testImg.src = track.metadata.cover;

				// 如果图片未缓存，使用淡入效果
				if (testImg.complete) {
					coverImg.style.opacity = "1";
				} else {
					coverImg.style.opacity = "0";
					coverImg.style.transition = "opacity 0.2s ease";
					
					coverImg.onload = () => {
						coverImg.style.opacity = "1";
					};
					
					coverImg.onerror = () => {
						// 封面图片加载失败，使用默认图标
						coverContainer.empty();
						setIcon(coverContainer, ICONS.MUSIC);
					};

					// 减少超时时间
					setTimeout(() => {
						if (coverImg.style.opacity === "0" && coverImg.parentNode) {
							coverContainer.empty();
							setIcon(coverContainer, ICONS.MUSIC);
						}
					}, 2000);
				}
			} else {
				setIcon(coverContainer, ICONS.MUSIC);
			}

			// 歌曲信息
			const info = content.createEl("div", { cls: "playlist-item-info" });

			const name = info.createEl("div", {
				cls: "playlist-item-name",
				text: track.metadata?.title || track.name,
			});

			const meta = info.createEl("div", {
				cls: "playlist-item-meta",
			});
			
			// 艺术家行
			const artistEl = meta.createEl("div", {
				cls: "playlist-item-artist",
				text: track.metadata?.artist || "未知艺术家",
			});
			
			// 专辑行
			if (track.metadata?.album) {
				const albumEl = meta.createEl("div", {
					cls: "playlist-item-album",
					text: track.metadata.album,
				});
			}

			// 事件监听
			li.draggable = true;
			li.addEventListener("dragstart", (e) => {
				e.dataTransfer?.setData("text/plain", `![[${track.path}]]`);
			});

			li.addEventListener("click", () => {
				this.events.onTrackSelect?.(track);
			});
		});
	}

	

	/**
	 * 设置刷新按钮加载状态
	 */
	setRefreshLoading(loading: boolean): void {
		if (loading) {
			this.refreshButton.addClass(CSS_CLASSES.IS_LOADING);
		} else {
			this.refreshButton.removeClass(CSS_CLASSES.IS_LOADING);
		}
	}

	/**
	 * 获取容器元素
	 */
	getElement(): HTMLElement {
		return this.containerEl;
	}

	/**
	 * 检查是否可见
	 */
	isOpen(): boolean {
		return this.isVisible;
	}

/**
	 * 清理资源
	 */
	cleanup(): void {
		// 清理隐藏超时
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
		}
		
		document.removeEventListener("click", this.handleDocumentClick, {
			capture: true,
		});
		document.removeEventListener("mousemove", this.handleDragMove);
		document.removeEventListener("mouseup", this.handleDragEnd);

		if (this.vinylPlayer) {
			this.vinylPlayer.cleanup();
		}

		this.containerEl.remove();
		this.events = {};
	}
}
