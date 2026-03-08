/**
 * WorldView - Command Bar
 * Vim-style command input bar for executing commands
 */

export class CommandBar {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private errorDisplay: HTMLElement;
  private isVisible: boolean = false;
  private onExecute: ((command: string) => void) | null = null;

  constructor() {
    // Create DOM structure
    this.container = document.createElement("div");
    this.container.className = "command-bar";

    const prefix = document.createElement("span");
    prefix.className = "command-bar-prefix";
    prefix.textContent = ":";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "command-bar-input";
    this.input.placeholder = "";

    this.errorDisplay = document.createElement("div");
    this.errorDisplay.className = "command-bar-error";

    this.container.appendChild(prefix);
    this.container.appendChild(this.input);
    this.container.appendChild(this.errorDisplay);

    // Append to document body
    document.body.appendChild(this.container);

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Keyboard handlers on input
    this.input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.hide();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const value = this.input.value.trim();
        if (value && this.onExecute) {
          this.onExecute(value);
        }
        return;
      }

      // Clear error on any other keypress
      this.clearError();
    });

    // Click outside handler
    document.addEventListener("click", (event: MouseEvent) => {
      if (!this.isVisible) return;

      const target = event.target as Node;
      if (!this.container.contains(target)) {
        this.hide();
      }
    });
  }

  show(): void {
    if (this.isVisible) return;

    this.isVisible = true;
    this.container.classList.add("visible");
    this.container.classList.remove("loading", "error", "success");
    this.input.value = "";
    this.clearError();
    this.input.focus();
  }

  hide(): void {
    if (!this.isVisible) return;

    this.isVisible = false;
    this.container.classList.remove("visible", "loading", "error", "success");
    this.input.value = "";
    this.clearError();
    this.input.blur();
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.container.classList.add("loading");
      this.container.classList.remove("error", "success");
    } else {
      this.container.classList.remove("loading");
    }
  }

  showError(message: string): void {
    this.errorDisplay.textContent = message;
    this.container.classList.add("error");
    this.container.classList.remove("loading", "success");
  }

  showSuccess(): void {
    this.container.classList.add("success");
    this.container.classList.remove("loading", "error");

    // Brief green flash, then hide
    setTimeout(() => {
      this.hide();
    }, 300);
  }

  clearError(): void {
    this.errorDisplay.textContent = "";
    this.container.classList.remove("error");
  }

  setOnExecute(callback: (command: string) => void): void {
    this.onExecute = callback;
  }

  /** Check if the command bar is currently visible */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /** Get the current input value */
  getValue(): string {
    return this.input.value;
  }
}
