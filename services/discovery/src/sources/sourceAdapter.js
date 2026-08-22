export class SourceAdapter {
  constructor(name) {
    if (!name) {
      throw new Error("Source adapter requires a unique name.");
    }
    this.name = name;
  }

  /**
   * Determine if the source is currently enabled by checking configuration.
   * Must be overridden by subclasses.
   * @returns {boolean}
   */
  get isEnabled() {
    return false;
  }

  /**
   * Fetch raw candidates from the source.
   * @param {Object} context Context metadata (discovery_run_id, etc.)
   * @returns {Promise<Array>} Array of raw candidate objects
   */
  async fetch(context) {
    throw new Error(`SourceAdapter [${this.name}] must implement fetch(context)`);
  }
}
