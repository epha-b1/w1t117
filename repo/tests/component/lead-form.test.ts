import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import LeadForm from '../../src/components/leads/LeadForm.svelte';
import type { CreateLeadInput } from '../../src/types/lead.types';

function fillValid(container: HTMLElement, overrides: Record<string, string> = {}): void {
  const byLabel = (label: string) => {
    const el = Array.from(container.querySelectorAll('label')).find((l) =>
      l.textContent?.trim().startsWith(label)
    );
    if (!el) throw new Error('label missing: ' + label);
    return el.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
  };
  const set = (label: string, val: string) => {
    const el = byLabel(label);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('Title', overrides.title ?? 'Widget rework');
  set('Requirements', overrides.requirements ?? 'Need 40 widgets');
  set('Budget', overrides.budget ?? '100');
  set('Availability start', overrides.availabilityStart ?? '2026-05-01');
  set('Availability end', overrides.availabilityEnd ?? '2026-05-30');
  set('Contact name', overrides.contactName ?? 'Jane Doe');
  set('Contact phone', overrides.contactPhone ?? '555-123-4567');
  set('Contact email', overrides.contactEmail ?? 'jane@acme.test');
}

describe('<LeadForm>', () => {
  afterEach(cleanup);

  it('renders all required fields', () => {
    const { getByText, container } = render(LeadForm, {
      props: { onSubmit: vi.fn() }
    });
    expect(getByText(/^Title/)).toBeInTheDocument();
    expect(getByText(/^Requirements/)).toBeInTheDocument();
    expect(getByText(/^Budget/)).toBeInTheDocument();
    expect(getByText(/^Availability start/)).toBeInTheDocument();
    expect(getByText(/^Availability end/)).toBeInTheDocument();
    expect(getByText(/^Contact name/)).toBeInTheDocument();
    expect(getByText(/^Contact phone/)).toBeInTheDocument();
    expect(getByText(/^Contact email/)).toBeInTheDocument();
    // Save + Cancel buttons visible
    expect(getByText('Save')).toBeInTheDocument();
    expect(getByText('Cancel')).toBeInTheDocument();
    // No error on initial render
    expect(container.querySelector('.error')).toBeNull();
  });

  it('prefills from `initial` props', () => {
    const { getByDisplayValue } = render(LeadForm, {
      props: {
        onSubmit: vi.fn(),
        initial: {
          title: 'Prefilled',
          requirements: 'fill',
          budget: 250,
          contactName: 'Ada',
          contactPhone: '5551212123',
          contactEmail: 'ada@x.y'
        }
      }
    });
    expect(getByDisplayValue('Prefilled')).toBeInTheDocument();
    expect(getByDisplayValue('fill')).toBeInTheDocument();
    expect(getByDisplayValue('250')).toBeInTheDocument();
    expect(getByDisplayValue('Ada')).toBeInTheDocument();
    expect(getByDisplayValue('ada@x.y')).toBeInTheDocument();
  });

  it('shows "All fields are required" when submitting empty', async () => {
    const onSubmit = vi.fn();
    const { container, getByText } = render(LeadForm, { props: { onSubmit } });
    const form = container.querySelector('form')!;
    await fireEvent.submit(form);
    expect(getByText('All fields are required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows "Availability window is required" when only dates missing', async () => {
    const onSubmit = vi.fn();
    const { container, getByText } = render(LeadForm, { props: { onSubmit } });
    fillValid(container, { availabilityStart: '', availabilityEnd: '' });
    await fireEvent.submit(container.querySelector('form')!);
    expect(getByText('Availability window is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with typed payload on valid submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(LeadForm, { props: { onSubmit } });
    fillValid(container);
    await fireEvent.submit(container.querySelector('form')!);
    // Allow the async submit handler to resolve.
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as CreateLeadInput;
    expect(payload.title).toBe('Widget rework');
    expect(payload.budget).toBe(100);
    expect(typeof payload.availabilityStart).toBe('number');
    expect(typeof payload.availabilityEnd).toBe('number');
    expect(payload.availabilityEnd).toBeGreaterThan(payload.availabilityStart);
  });

  it('surfaces the error message when onSubmit throws', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    const { container, findByText } = render(LeadForm, { props: { onSubmit } });
    fillValid(container);
    await fireEvent.submit(container.querySelector('form')!);
    await findByText('boom');
    // Buttons re-enabled after failure
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Cancel invokes the onCancel callback', async () => {
    const onCancel = vi.fn();
    const { getByText } = render(LeadForm, { props: { onSubmit: vi.fn(), onCancel } });
    await fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
