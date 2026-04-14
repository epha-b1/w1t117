<script lang="ts">
  import type { BomItem } from '../../types/plan.types';
  import { planService } from '../../services/plan.service';
  import { session } from '../../stores/session.store';
  import { formatCurrency } from '../../utils/format';
  export let planId: string;
  export let items: BomItem[] = [];
  export let readOnly = false;
  export let onChange: () => Promise<void> | void = () => {};

  let newPart = '';
  let newDesc = '';
  let newQty: number | string = 1;
  let newUnit = 'ea';
  let newCost: number | string = 0;
  let newLength: number | string = '';

  async function addItem() {
    if (!newPart) return;
    await planService.addBomItem(planId, {
      partNumber: newPart,
      description: newDesc,
      quantity: Number(newQty) || 0,
      unit: newUnit,
      unitCost: Number(newCost) || 0,
      length: newLength === '' ? undefined : Number(newLength),
      sortOrder: items.length
    }, $session?.userId);
    newPart = '';
    newDesc = '';
    newQty = 1;
    newUnit = 'ea';
    newCost = 0;
    newLength = '';
    await onChange();
  }

  async function updateField(item: BomItem, field: keyof BomItem, value: unknown) {
    const patch = { [field]: value } as Partial<BomItem>;
    await planService.updateBomItem(item.id, patch, $session?.userId);
    await onChange();
  }

  function inputValue(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }

  function onPartChange(item: BomItem, e: Event) {
    void updateField(item, 'partNumber', inputValue(e));
  }
  function onDescChange(item: BomItem, e: Event) {
    void updateField(item, 'description', inputValue(e));
  }
  function onQtyChange(item: BomItem, e: Event) {
    void updateField(item, 'quantity', Number(inputValue(e)));
  }
  function onUnitChange(item: BomItem, e: Event) {
    void updateField(item, 'unit', inputValue(e));
  }
  function onUnitCostChange(item: BomItem, e: Event) {
    void updateField(item, 'unitCost', Number(inputValue(e)));
  }
  function onLengthChange(item: BomItem, e: Event) {
    const v = inputValue(e);
    void updateField(item, 'length', v === '' ? undefined : Number(v));
  }

  async function remove(item: BomItem) {
    await planService.removeBomItem(item.id, $session?.userId);
    await onChange();
  }

  $: totalCents = items.reduce((sum, i) => sum + Math.round(i.unitCost * 100) * i.quantity, 0);
</script>

<table class="bom">
  <thead>
    <tr>
      <th>Part #</th>
      <th>Description</th>
      <th>Qty</th>
      <th>Unit</th>
      <th>Unit cost</th>
      <th>Length (ft)</th>
      <th>Line total</th>
      {#if !readOnly}<th></th>{/if}
    </tr>
  </thead>
  <tbody>
    {#each items as item (item.id)}
      <tr>
        <td>
          {#if readOnly}
            {item.partNumber}
          {:else}
            <input value={item.partNumber} on:change={(e) => onPartChange(item, e)} />
          {/if}
        </td>
        <td>
          {#if readOnly}
            {item.description}
          {:else}
            <input value={item.description} on:change={(e) => onDescChange(item, e)} />
          {/if}
        </td>
        <td>
          {#if readOnly}
            {item.quantity}
          {:else}
            <input type="number" min="0" value={item.quantity} on:change={(e) => onQtyChange(item, e)} />
          {/if}
        </td>
        <td>
          {#if readOnly}
            {item.unit}
          {:else}
            <input value={item.unit} on:change={(e) => onUnitChange(item, e)} />
          {/if}
        </td>
        <td>
          {#if readOnly}
            {formatCurrency(Math.round(item.unitCost * 100))}
          {:else}
            <input type="number" min="0" step="0.01" value={item.unitCost} on:change={(e) => onUnitCostChange(item, e)} />
          {/if}
        </td>
        <td>
          {#if readOnly}
            {item.length ?? ''}
          {:else}
            <input type="number" min="0" step="0.1" value={item.length ?? ''} on:change={(e) => onLengthChange(item, e)} />
          {/if}
        </td>
        <td>{formatCurrency(Math.round(item.unitCost * 100) * item.quantity)}</td>
        {#if !readOnly}
          <td><button class="link" on:click={() => remove(item)}>Remove</button></td>
        {/if}
      </tr>
    {/each}
    {#if items.length === 0}
      <tr><td colspan={readOnly ? 7 : 8} class="empty">No BOM items</td></tr>
    {/if}
  </tbody>
  {#if !readOnly}
    <tfoot>
      <tr>
        <td><input placeholder="Part #" bind:value={newPart} /></td>
        <td><input placeholder="Description" bind:value={newDesc} /></td>
        <td><input type="number" min="0" bind:value={newQty} /></td>
        <td><input bind:value={newUnit} /></td>
        <td><input type="number" min="0" step="0.01" bind:value={newCost} /></td>
        <td><input type="number" min="0" step="0.1" bind:value={newLength} /></td>
        <td><button class="add" on:click={addItem}>Add</button></td>
        <td></td>
      </tr>
    </tfoot>
  {/if}
  <tfoot>
    <tr class="total-row">
      <td colspan="6"></td>
      <td>Total: {formatCurrency(totalCents)}</td>
      {#if !readOnly}<td></td>{/if}
    </tr>
  </tfoot>
</table>

<style>
  .bom { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; }
  th { background: #f7f7f7; font-weight: 600; }
  input { width: 100%; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 13px; }
  button.link { background: transparent; border: none; color: #dc2626; cursor: pointer; padding: 0; }
  button.add { background: #2563eb; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; }
  .empty { text-align: center; color: #888; padding: 16px; }
  .total-row td { font-weight: 600; background: #fafafa; }
</style>
