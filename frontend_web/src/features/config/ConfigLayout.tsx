import { Tabs } from '@mantine/core';
import { IconCalendarDue, IconClockDollar, IconSun } from '@tabler/icons-react';
import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { value: '/config/jornada', label: 'Jornada', icon: IconClockDollar },
  { value: '/config/holidays', label: 'Festivos', icon: IconSun },
  { value: '/config/surcharges', label: 'Recargos', icon: IconCalendarDue },
];

export function ConfigLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <Tabs
        value={location.pathname}
        onChange={(value) => value && navigate(value)}
        mb="lg"
      >
        <Tabs.List>
          {TABS.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value} leftSection={<tab.icon size={16} />}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Outlet />
    </>
  );
}
