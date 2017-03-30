/*
 * Copyright (C) 2011 Google Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
UI.SoftContextMenu = class {
  /**
   * @param {!Array.<!InspectorFrontendHostAPI.ContextMenuDescriptor>} items
   * @param {function(string)} itemSelectedCallback
   * @param {!UI.SoftContextMenu=} parentMenu
   */
  constructor(items, itemSelectedCallback, parentMenu) {
    this._items = items;
    this._itemSelectedCallback = itemSelectedCallback;
    this._parentMenu = parentMenu;
  }

  /**
   * @param {!Document} document
   * @param {!AnchorBox} anchorBox
   */
  show(document, anchorBox) {
    if (!this._items.length)
      return;

    this._document = document;

    this._glassPane = new UI.GlassPane();
    this._glassPane.setBlockPointerEvents(!this._parentMenu);
    this._glassPane.setSetOutsideClickCallback(event => {
      this._discardMenu(true, event);
      event.consume();
    });
    this._glassPane.registerRequiredCSS('ui/softContextMenu.css');
    this._glassPane.setContentAnchorBox(anchorBox);
    this._glassPane.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    this._glassPane.setMarginBehavior(UI.GlassPane.MarginBehavior.NoMargin);
    this._glassPane.setAnchorBehavior(
        this._parentMenu ? UI.GlassPane.AnchorBehavior.PreferRight : UI.GlassPane.AnchorBehavior.PreferBottom);

    this._contextMenuElement = this._glassPane.contentElement.createChild('div', 'soft-context-menu');
    this._contextMenuElement.tabIndex = 0;
    this._contextMenuElement.addEventListener('mouseup', e => e.consume(), false);
    this._contextMenuElement.addEventListener('keydown', this._menuKeyDown.bind(this), false);

    for (var i = 0; i < this._items.length; ++i)
      this._contextMenuElement.appendChild(this._createMenuItem(this._items[i]));

    this._glassPane.show(document);
    this._focus();
  }

  discard() {
    this._discardMenu(true);
  }

  _createMenuItem(item) {
    if (item.type === 'separator')
      return this._createSeparator();

    if (item.type === 'subMenu')
      return this._createSubMenu(item);

    var menuItemElement = createElementWithClass('div', 'soft-context-menu-item');
    var checkMarkElement = UI.Icon.create('smallicon-checkmark', 'checkmark');
    menuItemElement.appendChild(checkMarkElement);
    if (!item.checked)
      checkMarkElement.style.opacity = '0';

    if (item.element) {
      var wrapper = menuItemElement.createChild('div', 'soft-context-menu-custom-item');
      wrapper.appendChild(item.element);
      menuItemElement._isCustom = true;
      return menuItemElement;
    }

    if (!item.enabled)
      menuItemElement.classList.add('soft-context-menu-disabled');
    menuItemElement.createTextChild(item.label);
    menuItemElement.createChild('span', 'soft-context-menu-shortcut').textContent = item.shortcut;

    menuItemElement.addEventListener('mousedown', this._menuItemMouseDown.bind(this), false);
    menuItemElement.addEventListener('mouseup', this._menuItemMouseUp.bind(this), false);

    // Manually manage hover highlight since :hover does not work in case of click-and-hold menu invocation.
    menuItemElement.addEventListener('mouseover', this._menuItemMouseOver.bind(this), false);
    menuItemElement.addEventListener('mouseleave', this._menuItemMouseLeave.bind(this), false);

    menuItemElement._actionId = item.id;
    return menuItemElement;
  }

  _createSubMenu(item) {
    var menuItemElement = createElementWithClass('div', 'soft-context-menu-item');
    menuItemElement._subItems = item.subItems;

    // Occupy the same space on the left in all items.
    var checkMarkElement = UI.Icon.create('smallicon-checkmark', 'soft-context-menu-item-checkmark');
    checkMarkElement.classList.add('checkmark');
    menuItemElement.appendChild(checkMarkElement);
    checkMarkElement.style.opacity = '0';

    menuItemElement.createTextChild(item.label);

    var subMenuArrowElement = menuItemElement.createChild('span', 'soft-context-menu-item-submenu-arrow');
    subMenuArrowElement.textContent = '\u25B6';  // BLACK RIGHT-POINTING TRIANGLE

    menuItemElement.addEventListener('mousedown', this._menuItemMouseDown.bind(this), false);
    menuItemElement.addEventListener('mouseup', this._menuItemMouseUp.bind(this), false);

    // Manually manage hover highlight since :hover does not work in case of click-and-hold menu invocation.
    menuItemElement.addEventListener('mouseover', this._menuItemMouseOver.bind(this), false);
    menuItemElement.addEventListener('mouseleave', this._menuItemMouseLeave.bind(this), false);

    return menuItemElement;
  }

  _createSeparator() {
    var separatorElement = createElementWithClass('div', 'soft-context-menu-separator');
    separatorElement._isSeparator = true;
    separatorElement.createChild('div', 'separator-line');
    return separatorElement;
  }

  _menuItemMouseDown(event) {
    // Do not let separator's mouse down hit menu's handler - we need to receive mouse up!
    event.consume(true);
  }

  _menuItemMouseUp(event) {
    this._triggerAction(event.target, event);
    event.consume();
  }

  _focus() {
    this._contextMenuElement.focus();
  }

  _triggerAction(menuItemElement, event) {
    if (!menuItemElement._subItems) {
      this._discardMenu(true, event);
      if (typeof menuItemElement._actionId !== 'undefined') {
        this._itemSelectedCallback(menuItemElement._actionId);
        delete menuItemElement._actionId;
      }
      return;
    }

    this._showSubMenu(menuItemElement);
    event.consume();
  }

  _showSubMenu(menuItemElement) {
    if (menuItemElement._subMenuTimer) {
      clearTimeout(menuItemElement._subMenuTimer);
      delete menuItemElement._subMenuTimer;
    }
    if (this._subMenu)
      return;

    this._subMenu = new UI.SoftContextMenu(menuItemElement._subItems, this._itemSelectedCallback, this);
    var anchorBox = menuItemElement.boxInWindow();
    // Adjust for padding.
    anchorBox.y -= 5;
    anchorBox.x += 3;
    anchorBox.width -= 6;
    anchorBox.height += 10;
    this._subMenu.show(this._document, anchorBox);
  }

  _hideSubMenu() {
    if (!this._subMenu)
      return;
    this._subMenu._discardSubMenus();
    this._focus();
  }

  _menuItemMouseOver(event) {
    this._highlightMenuItem(event.target, true);
  }

  _menuItemMouseLeave(event) {
    if (!this._subMenu || !event.relatedTarget) {
      this._highlightMenuItem(null, true);
      return;
    }

    var relatedTarget = event.relatedTarget;
    if (relatedTarget === this._contextMenuElement)
      this._highlightMenuItem(null, true);
  }

  /**
   * @param {?Element} menuItemElement
   * @param {boolean} scheduleSubMenu
   */
  _highlightMenuItem(menuItemElement, scheduleSubMenu) {
    if (this._highlightedMenuItemElement === menuItemElement)
      return;

    this._hideSubMenu();
    if (this._highlightedMenuItemElement) {
      this._highlightedMenuItemElement.classList.remove('force-white-icons');
      this._highlightedMenuItemElement.classList.remove('soft-context-menu-item-mouse-over');
      if (this._highlightedMenuItemElement._subItems && this._highlightedMenuItemElement._subMenuTimer) {
        clearTimeout(this._highlightedMenuItemElement._subMenuTimer);
        delete this._highlightedMenuItemElement._subMenuTimer;
      }
    }
    this._highlightedMenuItemElement = menuItemElement;
    if (this._highlightedMenuItemElement) {
      this._highlightedMenuItemElement.classList.add('force-white-icons');
      this._highlightedMenuItemElement.classList.add('soft-context-menu-item-mouse-over');
      this._contextMenuElement.focus();
      if (scheduleSubMenu && this._highlightedMenuItemElement._subItems &&
          !this._highlightedMenuItemElement._subMenuTimer) {
        this._highlightedMenuItemElement._subMenuTimer =
            setTimeout(this._showSubMenu.bind(this, this._highlightedMenuItemElement), 150);
      }
    }
  }

  _highlightPrevious() {
    var menuItemElement = this._highlightedMenuItemElement ? this._highlightedMenuItemElement.previousSibling :
                                                             this._contextMenuElement.lastChild;
    while (menuItemElement && (menuItemElement._isSeparator || menuItemElement._isCustom))
      menuItemElement = menuItemElement.previousSibling;
    if (menuItemElement)
      this._highlightMenuItem(menuItemElement, false);
  }

  _highlightNext() {
    var menuItemElement = this._highlightedMenuItemElement ? this._highlightedMenuItemElement.nextSibling :
                                                             this._contextMenuElement.firstChild;
    while (menuItemElement && (menuItemElement._isSeparator || menuItemElement._isCustom))
      menuItemElement = menuItemElement.nextSibling;
    if (menuItemElement)
      this._highlightMenuItem(menuItemElement, false);
  }

  _menuKeyDown(event) {
    switch (event.key) {
      case 'ArrowUp':
        this._highlightPrevious();
        break;
      case 'ArrowDown':
        this._highlightNext();
        break;
      case 'ArrowLeft':
        if (this._parentMenu) {
          this._highlightMenuItem(null, false);
          this._parentMenu._hideSubMenu();
        }
        break;
      case 'ArrowRight':
        if (!this._highlightedMenuItemElement)
          break;
        if (this._highlightedMenuItemElement._subItems) {
          this._showSubMenu(this._highlightedMenuItemElement);
          this._subMenu._focus();
          this._subMenu._highlightNext();
        }
        break;
      case 'Escape':
        this._discardMenu(false, event);
        break;
      case 'Enter':
        if (!isEnterKey(event))
          break;
      // Fall through
      case ' ':  // Space
        if (this._highlightedMenuItemElement)
          this._triggerAction(this._highlightedMenuItemElement, event);
        if (this._highlightedMenuItemElement._subItems) {
          this._subMenu._focus();
          this._subMenu._highlightNext();
        }
        break;
    }
    event.consume(true);
  }

  /**
   * @param {boolean} closeParentMenus
   * @param {!Event=} event
   */
  _discardMenu(closeParentMenus, event) {
    if (this._subMenu && !closeParentMenus)
      return;

    this._discardSubMenus();

    if (this._parentMenu) {
      if (closeParentMenus)
        this._parentMenu._discardMenu(closeParentMenus, event);
      else
        this._parentMenu._focus();
    }

    if (event)
      event.consume(true);
  }

  _discardSubMenus() {
    if (this._subMenu)
      this._subMenu._discardSubMenus();
    if (this._glassPane) {
      this._glassPane.hide();
      delete this._glassPane;
    }
    if (this._parentMenu)
      delete this._parentMenu._subMenu;
  }
};
