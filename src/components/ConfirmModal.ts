import { App, Modal, Setting } from "obsidian";

/**
 * 确认对话框模态框
 */
export class ConfirmModal extends Modal {
	private title: string;
	private message: string;
	private confirmText: string;
	private onConfirm: () => void;
	private onCancel?: () => void;

	constructor(
		app: App,
		title: string,
		message: string,
		confirmText: string,
		onConfirm: () => void,
		onCancel?: () => void
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.confirmText = confirmText;
		this.onConfirm = onConfirm;
		this.onCancel = onCancel;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl).setName(this.title).setHeading();

		contentEl.createEl("p", {
			cls: "confirm-modal-message",
			text: this.message,
		});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText("Cancel")
					.setCta()
					.onClick(() => {
						this.close();
						this.onCancel?.();
					});
			})
			.addButton((btn) => {
				btn.setButtonText(this.confirmText)
					.setWarning()
					.onClick(() => {
						this.close();
						this.onConfirm();
					});
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}