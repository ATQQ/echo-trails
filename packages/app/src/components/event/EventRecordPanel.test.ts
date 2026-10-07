import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EventRecordPanel from './EventRecordPanel.vue';

const event = {
  id: 'e1',
  name: '喝水',
  emoji: '💧',
  unit: 'ml',
  defaultAmount: 200,
  sortOrder: 0,
};

const record = {
  id: 'r1',
  eventId: 'e1',
  eventName: '喝水',
  emoji: '💧',
  occurredAt: 1_760_000_000_000,
  date: '2026-10-07',
  note: '',
  amount: 200,
};

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(EventRecordPanel, {
    props: {
      show: true,
      event,
      record,
      ...props,
    },
    global: {
      stubs: {
        'van-popup': { template: '<div><slot /></div>' },
        'van-icon': true,
      },
    },
  });
}

describe('EventRecordPanel 家人标签', () => {
  it('只有一个家人时不展示标签', () => {
    const wrapper = mountPanel({
      families: [{ id: 'default', name: '默认' }],
      familyId: 'default',
    });

    expect(wrapper.find('.family-tags').exists()).toBe(false);
    wrapper.unmount();
  });

  it('多个家人时展示全部标签并高亮当前家人', () => {
    const wrapper = mountPanel({
      families: [
        { id: 'default', name: '默认' },
        { id: 'baby', name: '宝贝' },
      ],
      familyId: 'default',
    });

    const chips = wrapper.findAll('.chip--family');
    expect(chips).toHaveLength(2);
    expect(chips[0].text()).toContain('默认');
    expect(chips[0].classes()).toContain('is-active');
    expect(chips[1].text()).toContain('宝贝');
    expect(chips[1].classes()).not.toContain('is-active');
    wrapper.unmount();
  });

  it('点击其他家人时带上最新的数量和备注', async () => {
    const wrapper = mountPanel({
      families: [
        { id: 'default', name: '默认' },
        { id: 'baby', name: '宝贝' },
      ],
      familyId: 'default',
    });

    await wrapper.find('.amount__input').setValue('350');
    await wrapper.find('.note-toggle').trigger('click');
    await wrapper.find('.note-input').setValue('饭后');
    await wrapper.findAll('.chip--family')[1].trigger('click');

    expect(wrapper.emitted('switch-family')?.[0]?.[0]).toEqual({
      familyId: 'baby',
      amount: 350,
      note: '饭后',
    });
    wrapper.unmount();
  });

  it('切换中禁用标签', () => {
    const wrapper = mountPanel({
      families: [
        { id: 'default', name: '默认' },
        { id: 'baby', name: '宝贝' },
      ],
      familyId: 'default',
      switching: true,
    });

    for (const chip of wrapper.findAll('.chip--family')) {
      expect(chip.attributes('disabled')).toBeDefined();
    }
    wrapper.unmount();
  });
});
