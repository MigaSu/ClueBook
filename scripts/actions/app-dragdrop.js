export const ClueBookDragDropMixin = (Base) => class extends Base {
  _setupListDragDrop(html) {
    let draggedItem = null;
    const listContainer = html.querySelector('.entries-list');
    if (!listContainer) return;

    listContainer.addEventListener('dragover', ev => ev.preventDefault());

    html.querySelectorAll('.entries-list .cluebook-entry').forEach(entry => {
      entry.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('.entry-controls') || ev.target.closest('.edit-mode')) {
          ev.preventDefault();
          return;
        }
        draggedItem = entry;

        listContainer.classList.add('is-dragging-list');
        setTimeout(() => entry.classList.add('is-dragging'), 0);
      });

      entry.addEventListener('dragend', async () => {
        if (!draggedItem) return;
        listContainer.classList.remove('is-dragging-list');
        draggedItem.classList.remove('is-dragging');
        draggedItem = null;

        // Save the new sort order
        const allEntries = Array.from(listContainer.querySelectorAll('.cluebook-entry'));
        const updates = {};
        
        allEntries.forEach((el, index) => {
          const id = el.dataset.entryId;
          const flagPath = `flags.ClueBook.data.${this.state.activeTab}.${id}.sort`;
          updates[flagPath] = index;
        });

        await this._updateWorkspaceData(updates);
      });

      entry.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        if (!draggedItem || draggedItem === entry) return;

        const allEntries = Array.from(listContainer.children);
        const draggedIndex = allEntries.indexOf(draggedItem);
        const targetIndex = allEntries.indexOf(entry);

        if (draggedIndex < targetIndex) {
          listContainer.insertBefore(draggedItem, entry.nextSibling);
        } else {
          listContainer.insertBefore(draggedItem, entry);
        }
      });
    });
  }
}
