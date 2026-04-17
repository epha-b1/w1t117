import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Modal from '../../src/components/common/Modal.svelte';

describe('<Modal>', () => {
  afterEach(cleanup);

  it('does not render when open=false', () => {
    const { queryByRole } = render(Modal, { props: { open: false, title: 'x' } });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders the dialog with title when open', () => {
    const { getByRole, getByText } = render(Modal, {
      props: { open: true, title: 'My Modal' }
    });
    const dialog = getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('My Modal');
    expect(getByText('My Modal')).toBeInTheDocument();
  });

  it('close button invokes onClose', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(Modal, {
      props: { open: true, title: 'T', onClose }
    });
    await fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('overlay click invokes onClose', async () => {
    const onClose = vi.fn();
    const { container } = render(Modal, {
      props: { open: true, title: 'T', onClose }
    });
    const overlay = container.querySelector('.overlay') as HTMLElement;
    await fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click on modal body does NOT bubble to overlay (onClose not called)', async () => {
    const onClose = vi.fn();
    const { getByRole } = render(Modal, {
      props: { open: true, title: 'T', onClose }
    });
    await fireEvent.click(getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape key triggers onClose via window listener', async () => {
    const onClose = vi.fn();
    render(Modal, { props: { open: true, title: 'T', onClose } });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('non-Escape keys do not trigger onClose', async () => {
    const onClose = vi.fn();
    render(Modal, { props: { open: true, title: 'T', onClose } });
    await fireEvent.keyDown(window, { key: 'Enter' });
    await fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('default onClose is a safe no-op when the prop is omitted: close + overlay + Escape all dispatch cleanly and leave the dialog DOM intact', async () => {
    const { getByLabelText, getByRole, container } = render(Modal, {
      props: { open: true, title: 'T' }
    });

    // The component itself never re-renders to closed when no handler is
    // provided (that would require external state), so after each synthetic
    // interaction the dialog must still be in the DOM with its ARIA metadata.
    const assertStillOpen = () => {
      const dialog = getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBe('T');
    };

    await fireEvent.click(getByLabelText('Close'));
    assertStillOpen();

    const overlay = container.querySelector('.overlay') as HTMLElement;
    await fireEvent.click(overlay);
    assertStillOpen();

    await fireEvent.keyDown(window, { key: 'Escape' });
    assertStillOpen();

    // And the body slot still renders exactly one header + one body wrapper.
    expect(container.querySelectorAll('header').length).toBe(1);
    expect(container.querySelectorAll('.body').length).toBe(1);
  });

  it('renders the footer slot wrapper only when slot content is provided', () => {
    // Without a footer slot, the component must not emit an empty <footer>.
    const { container } = render(Modal, { props: { open: true, title: 'T' } });
    expect(container.querySelector('footer')).toBeNull();
  });
});
