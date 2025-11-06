import { setIcon } from "obsidian";
import { MusicTrack, PlaybackMode } from "../types";
import { CSS_CLASSES, ICONS } from "../utils/constants";
import { clamp, formatTime } from "../utils/helpers";
import { LyricsComponent } from "./LyricsComponent";
import { VinylPlayer } from "./VinylPlayer";

export class MusicHubComponent {
	private containerEl: HTMLElement;
	private functionBar: HTMLElement;
	private favButton: HTMLButtonElement;
	private refreshButton: HTMLButtonElement;
	private searchInput: HTMLInputElement;
	private playlistToggleButton: HTMLButtonElement;
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
	private lyricsComponent: LyricsComponent | null = null;
	private lyricsButton: HTMLButtonElement;
	private lyricsContainer: HTMLElement;

	private isDragging = false;
	private isVisible = false;
	private isFirstShow = true;
	private dragOffset = { x: 0, y: 0 };
	private dragHandle: HTMLElement | null = null;

	private events: {
		onFavoriteToggle?: () => void;
		onRefresh?: () => void;
		onSearch?: (query: string) => void;
		onPlaylistToggle?: () => void;
		onCategoryChange?: (category: string) => void;
		onGetCategories?: () => { value: string; label: string }[];
		onGetCurrentCategory?: () => string;
		onModeToggle?: () => void;
		onPrevious?: () => void;
		onNext?: () => void;
		onSeek?: (percent: number) => void;
		onTrackSelect?: (track: MusicTrack) => void;
		onHide?: () => void;
		onVinylPlayPause?: () => void;
		onLyricsToggle?: () => void;
		onSeekToTime?: (time: number) => void;
	} = {};

	constructor() {
		try {
			this.createElements();
			this.setupEventListeners();
		} catch (error) {
			console.error("MusicHubComponent constructor error:", error);
			throw error;
		}
	}

	/**
	 * 创建DOM元素
	 */
	private createElements(): void {
		this.containerEl = document.body.createEl("div", {
			cls: CSS_CLASSES.HUB_CONTAINER,
		});
		this.containerEl.hide();

		// 添加拖拽手柄
		this.dragHandle = this.containerEl.createEl("div", {
			cls: "hub-drag-handle",
		});

		// 功能按钮栏
		this.createFunctionBar();

		// 控制区域
		this.createControls();

		// 歌词容器
		this.lyricsContainer = this.containerEl.createEl("div", {
			cls: "hub-lyrics-container",
		});
		this.lyricsContainer.hide(); // 默认隐藏

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

		// 刷新按钮
		this.refreshButton = this.functionBar.createEl("button", {
			cls: "hub-function-button hub-refresh-button",
		});
		setIcon(this.refreshButton, ICONS.REFRESH);

		// 搜索框
		this.searchInput = this.functionBar.createEl("input", {
			cls: "hub-search-input",
			type: "text",
			attr: { placeholder: "搜索歌曲、艺术家..." },
		});

		// 歌词按钮
		this.lyricsButton = this.functionBar.createEl("button", {
			cls: "hub-function-button hub-lyrics-button",
			attr: { title: "显示/隐藏歌词" },
		});
		setIcon(this.lyricsButton, ICONS.TEXT);
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

		// 时间显示和控制按钮容器
		const timeControlContainer = progressTimeContainer.createEl("div", {
			cls: "hub-time-control-container",
		});

		// 播放模式按钮（左侧）
		this.modeButton = timeControlContainer.createEl("button", {
			cls: "hub-control-button",
		});
		setIcon(this.modeButton, ICONS.REPEAT);

		// 播放列表选择器
		this.playlistToggleButton = timeControlContainer.createEl("button", {
			cls: "hub-control-button hub-playlist-toggle",
		});
		setIcon(this.playlistToggleButton, ICONS.LIST);

		// 时间显示（中间）
		this.timeDisplay = timeControlContainer.createEl("div", {
			cls: "hub-time-display",
			text: "--:-- / --:--",
		});

		// 收藏按钮（右侧）
		this.favButton = timeControlContainer.createEl("button", {
			cls: "hub-control-button hub-favorite-button",
		});
		setIcon(this.favButton, ICONS.HEART);
	}

	/**
	 * 设置事件监听器
	 */
	private setupEventListeners(): void {
		// 拖拽事件
		this.dragHandle?.addEventListener("mousedown", this.handleHubDragStart);

		// 功能按钮事件
		this.favButton.addEventListener("click", () => {
			this.events.onFavoriteToggle?.();
		});

		this.refreshButton.addEventListener("click", () => {
			this.events.onRefresh?.();
		});

		// 搜索框事件
		this.searchInput.addEventListener("input", () => {
			this.events.onSearch?.(this.searchInput.value);
		});

		// 歌词按钮事件
		this.lyricsButton.addEventListener("click", () => {
			this.toggleLyrics();
		});

		// 播放列表切换按钮事件
		this.playlistToggleButton.addEventListener("click", (e) => {
			e.stopPropagation(); // 防止事件冒泡
			const existingSelector = this.containerEl.querySelector(
				".playlist-selector-container"
			);
			if (existingSelector) {
				this.hidePlaylistSelector();
			} else {
				this.showPlaylistSelector();
			}
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

		// 点击外部关闭功能已禁用 - 现在只能通过状态栏按钮关闭
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
	 * 切换歌词显示
	 */
	private toggleLyrics(): void {
		const isVisible = !this.lyricsContainer.hasClass("hidden");

		if (isVisible) {
			this.hideLyrics();
		} else {
			this.showLyrics();
		}

		this.events.onLyricsToggle?.();
	}

	/**
	 * 显示歌词
	 */
	private showLyrics(): void {
		this.lyricsContainer.removeClass("hidden");
		this.lyricsContainer.show();
		this.lyricsButton.addClass("active");

		// 如果还没有歌词组件，创建一个
		if (!this.lyricsComponent) {
			this.lyricsComponent = new LyricsComponent(this.lyricsContainer);

			// 监听歌词组件的时间跳转事件
			this.lyricsContainer.addEventListener(
				"lyrics-seek-to-time",
				(event: CustomEvent) => {
					const time = event.detail[0];
					this.events.onSeekToTime?.(time);
				}
			);
		}
	}

	/**
	 * 隐藏歌词
	 */
	private hideLyrics(): void {
		this.lyricsContainer.addClass("hidden");
		this.lyricsContainer.hide();
		this.lyricsButton.removeClass("active");
	}

	/**
	 * 更新歌词内容
	 */
	updateLyrics(lyrics: any): void {
		if (this.lyricsComponent) {
			this.lyricsComponent.setLyrics(lyrics);
		}
	}

	/**
	 * 更新当前歌词行
	 */
	updateCurrentLyricsLine(lineIndex: number): void {
		if (this.lyricsComponent) {
			this.lyricsComponent.updateCurrentLine(lineIndex);
		}
	}

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
		try {
			// 检查是否已有保存的位置
			const savedLeft = this.containerEl.style.left;
			const savedTop = this.containerEl.style.top;

			// 确保容器显示 - 强制设置显示样式
			this.containerEl.show();
			this.containerEl.style.display = "block";
			this.containerEl.style.visibility = "visible";

			if (savedLeft && savedTop) {
				// 使用保存的位置
				this.containerEl.style.left = savedLeft;
				this.containerEl.style.top = savedTop;
			} else {
				// 首次显示，计算默认位置
				const buttonRect = anchorElement.getBoundingClientRect();
				const hubWidth = 380; // 与CSS中的容器宽度一致
				const screenWidth = window.innerWidth;
				const screenHeight = window.innerHeight;

				// 获取容器实际高度
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

				this.containerEl.style.left = `${hubLeft}px`;
				this.containerEl.style.top = `${hubTop}px`;
				this.containerEl.style.bottom = "auto"; // 取消bottom设置
			}

			this.isVisible = true;

			// 如果是第一次显示，自动触发刷新
			if (this.isFirstShow) {
				this.isFirstShow = false;
				// 延迟一点时间确保UI完全渲染后再触发刷新
				setTimeout(() => {
					this.events.onRefresh?.();
				}, 100);
			}
		} catch (error) {
			console.error("MusicHub: Error showing hub:", error);
		}
	}
	/**
	 * 隐藏Hub
	 */
	hide(): void {
		this.containerEl.hide();
		this.containerEl.style.display = "none";
		this.isVisible = false;
		this.events.onHide?.();
	}

	/**
	 * 切换显示状态
	 */
	toggle(anchorElement: HTMLElement): void {
		if (this.isVisible) {
			// Hiding music hub (currently visible)
			this.hide();
		} else {
			// Showing music hub (currently hidden)
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
		// 更新背景封面
		this.updateBackgroundCover(track);
	}

	/**
	 * 更新背景封面
	 */
	private updateBackgroundCover(track: MusicTrack | null): void {
		if (track && track.metadata?.cover) {
			// 有封面，设置背景图片
			this.containerEl.style.setProperty(
				"--background-cover",
				`url(${track.metadata.cover})`
			);
			this.containerEl.addClass("has-background");
			this.containerEl.removeClass("no-cover");

			// 预加载图片以确保背景显示
			const img = new Image();
			img.onload = () => {
				// 图片加载成功，更新背景
				this.containerEl.style.setProperty(
					"--background-cover",
					`url(${track.metadata.cover})`
				);
				this.containerEl.addClass("has-background");
				this.containerEl.removeClass("no-cover");
			};
			img.onerror = () => {
				// 图片加载失败，使用灰色蒙版
				this.applyNoCoverBackground();
			};
			img.src = track.metadata.cover;
		} else if (track) {
			// 有音乐但无封面，使用灰色蒙版
			this.applyNoCoverBackground();
		} else {
			// 没有音乐，移除所有背景
			this.containerEl.removeClass("has-background");
			this.containerEl.removeClass("no-cover");
			this.containerEl.style.removeProperty("--background-cover");
		}
	}

	/**
	 * 应用无封面时的灰色蒙版背景
	 */
	private applyNoCoverBackground(): void {
		this.containerEl.addClass("has-background");
		this.containerEl.addClass("no-cover");
		this.containerEl.style.removeProperty("--background-cover");
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
		this.playlistEl
			.querySelectorAll(`.${CSS_CLASSES.IS_PLAYING}`)
			.forEach((item) => {
				item.removeClass(CSS_CLASSES.IS_PLAYING);
			});

		// 为当前播放项添加播放状态
		if (track) {
			const currentItem = this.playlistEl.querySelector(
				`[data-track-id="${track.id}"]`
			);
			if (currentItem) {
				currentItem.addClass(CSS_CLASSES.IS_PLAYING);
			}
		}
	}

	/**
	 * 更新左右唱片按钮的封面
	 */
	updateSideVinyls(
		prevTrack: MusicTrack | null,
		nextTrack: MusicTrack | null
	): void {
		// 更新左侧唱片（上一首）
		this.updateSideVinyl(this.leftVinylButton, prevTrack);

		// 更新右侧唱片（下一首）
		this.updateSideVinyl(this.rightVinylButton, nextTrack);
	}

	/**
	 * 更新单个侧边唱片
	 */
	private updateSideVinyl(
		button: HTMLButtonElement,
		track: MusicTrack | null
	): void {
		const coverEl = button.querySelector(
			".hub-side-vinyl-cover"
		) as HTMLElement;
		if (!coverEl) return;

		if (track && track.metadata?.cover) {
			coverEl.style.backgroundImage = `url(${track.metadata.cover})`;
			coverEl.style.opacity = "1";
		} else {
			coverEl.style.backgroundImage = "";
			coverEl.style.opacity = "0";
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

			// 为加载状态应用无封面背景样式
			this.applyNoCoverBackground();
			return;
		}

		if (tracks.length === 0) {
			this.playlistEl.createEl("li", {
				text: "此列表为空",
				cls: "playlist-empty",
			});

			// 为空列表应用无封面背景样式
			this.applyNoCoverBackground();
			return;
		}

		// 有歌曲时，确保背景由当前播放歌曲决定
		// 但只有当当前歌曲在新歌单中时才应用
		const isCurrentTrackInNewPlaylist =
			currentTrack &&
			tracks.some((track) => track.id === currentTrack.id);
		if (tracks.length > 0 && isCurrentTrackInNewPlaylist && currentTrack) {
			this.updateBackgroundCover(currentTrack);
		} else if (tracks.length > 0) {
			// 如果当前歌曲不在新歌单中，使用新歌单第一首歌的封面（如果有）
			this.updateBackgroundCover(tracks[0]);
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
						if (
							coverImg.style.opacity === "0" &&
							coverImg.parentNode
						) {
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
	 * 处理音乐中心拖拽开始
	 */
	private handleHubDragStart = (e: MouseEvent): void => {
		this.isDragging = true;
		this.containerEl.addClass(CSS_CLASSES.IS_DRAGGING);

		const rect = this.containerEl.getBoundingClientRect();
		this.dragOffset.x = e.clientX - rect.left;
		this.dragOffset.y = e.clientY - rect.top;

		document.addEventListener("mousemove", this.handleHubDragMove);
		document.addEventListener("mouseup", this.handleHubDragEnd);

		e.preventDefault();
	};

	/**
	 * 处理音乐中心拖拽移动
	 */
	private handleHubDragMove = (e: MouseEvent): void => {
		if (this.isDragging) {
			const newX = e.clientX - this.dragOffset.x;
			const newY = e.clientY - this.dragOffset.y;

			// 限制在视窗内
			const maxX = window.innerWidth - this.containerEl.offsetWidth;
			const maxY = window.innerHeight - this.containerEl.offsetHeight;

			const constrainedX = Math.max(0, Math.min(newX, maxX));
			const constrainedY = Math.max(0, Math.min(newY, maxY));

			this.containerEl.style.left = `${constrainedX}px`;
			this.containerEl.style.top = `${constrainedY}px`;
		}
	};

	/**
	 * 处理音乐中心拖拽结束
	 */
	private handleHubDragEnd = (): void => {
		this.isDragging = false;
		this.containerEl.removeClass(CSS_CLASSES.IS_DRAGGING);

		document.removeEventListener("mousemove", this.handleHubDragMove);
		document.removeEventListener("mouseup", this.handleHubDragEnd);
	};

	/**
	 * 清理资源
	 */
	cleanup(): void {
		document.removeEventListener("mousemove", this.handleDragMove);
		document.removeEventListener("mouseup", this.handleDragEnd);
		document.removeEventListener("mousemove", this.handleHubDragMove);
		document.removeEventListener("mouseup", this.handleHubDragEnd);

		if (this.vinylPlayer) {
			this.vinylPlayer.cleanup();
		}

		// 清理背景
		this.containerEl.removeClass("has-background");
		this.containerEl.style.removeProperty("--background-cover");

		this.containerEl.remove();
		this.events = {};
	}

	/**
	 * 显示歌单选择器
	 */
	private showPlaylistSelector(): void {
		// 获取当前歌单列表
		const categories = this.events.onGetCategories?.() || [];

		// 如果选择器已存在，先移除
		this.hidePlaylistSelector();

		// 创建选择器容器
		const selectorContainer = this.containerEl.createEl("div", {
			cls: "playlist-selector-container",
		});

		// 阻止选择器内部的点击事件冒泡
		selectorContainer.addEventListener("click", (e) => {
			e.stopPropagation();
		});

		// 创建选择器标题
		const title = selectorContainer.createEl("div", {
			cls: "playlist-selector-title",
			text: "选择歌单",
		});

		// 创建歌单列表
		const playlistList = selectorContainer.createEl("div", {
			cls: "playlist-selector-list",
		});

		// 获取当前选中的歌单
		const currentCategory = this.events.onGetCurrentCategory?.() || "all";

		// 添加歌单选项
		categories.forEach((category: { value: string; label: string }) => {
			const item = playlistList.createEl("div", {
				cls: `playlist-selector-item ${
					category.value === currentCategory ? "is-active" : ""
				}`,
				text: category.label,
			});

			item.addEventListener("click", () => {
				this.events.onCategoryChange?.(category.value as any);
				this.hidePlaylistSelector();
			});

			item.addEventListener("mouseenter", () => {
				item.addClass("is-hovered");
			});

			item.addEventListener("mouseleave", () => {
				item.removeClass("is-hovered");
			});
		});

		// 点击外部关闭选择器
		const closeHandler = (e: MouseEvent) => {
			// 检查点击是否在选择器外部且不在按钮上
			if (
				!selectorContainer.contains(e.target as Node) &&
				!this.playlistToggleButton.contains(e.target as Node)
			) {
				this.hidePlaylistSelector();
				document.removeEventListener("click", closeHandler);
			}
		};

		// 延迟添加点击事件，避免立即触发
		setTimeout(() => {
			document.addEventListener("click", closeHandler);
		}, 100);

		// 定位选择器
		const buttonRect = this.playlistToggleButton.getBoundingClientRect();
		const containerRect = this.containerEl.getBoundingClientRect();

		// 计算位置，确保选择器不超出容器边界
		let leftPos = buttonRect.left - containerRect.left - 50; // 稍微左移以居中
		const selectorWidth = 180; // 预估选择器宽度
		const containerWidth = containerRect.width;

		// 确保选择器不超出左边界
		if (leftPos < 10) {
			leftPos = 10;
		}
		// 确保选择器不超出右边界
		if (leftPos + selectorWidth > containerWidth - 10) {
			leftPos = containerWidth - selectorWidth - 10;
		}

		selectorContainer.style.position = "absolute";
		selectorContainer.style.bottom = `${
			containerRect.bottom - buttonRect.top + 8
		}px`;
		selectorContainer.style.left = `${leftPos}px`;
		selectorContainer.style.zIndex = "1000";
	}

	/**
	 * 隐藏歌单选择器
	 */
	private hidePlaylistSelector(): void {
		const selector = this.containerEl.querySelector(
			".playlist-selector-container"
		);
		if (selector) {
			selector.remove();
		}
	}
}
