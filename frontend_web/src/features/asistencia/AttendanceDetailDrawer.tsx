import {
  Alert,
  Anchor,
  Badge,
  Drawer,
  Group,
  Image,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import type { AttendanceDto } from '@futuragest/contracts';
import React from 'react';
import { useSignatureUrl } from './attendance-queries';
import { formatDateTime, mapsLink } from './format';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </div>
  );
}

function SignatureBlock({
  title,
  signatureId,
  phase,
  hasKey,
}: {
  title: string;
  /** Attendance id to fetch for, or null to disable the fetch (drawer closed / no key). */
  signatureId: string | null;
  phase: 'checkin' | 'checkout';
  hasKey: boolean;
}) {
  const sig = useSignatureUrl(signatureId, phase);
  return (
    <>
      <Title order={5} mt="sm">
        {title}
      </Title>
      {!hasKey ? (
        <Text size="sm" c="dimmed">
          Sin firma registrada.
        </Text>
      ) : sig.isLoading ? (
        <Loader size="sm" aria-label={`Cargando firma de ${phase}`} />
      ) : sig.isError ? (
        <Alert color="red" variant="light">
          No se pudo cargar la firma.
        </Alert>
      ) : (
        <Image src={sig.data?.url} alt={`${title} imagen`} h={160} fit="contain" bg="gray.0" />
      )}
    </>
  );
}

function GeoLine({
  label,
  lat,
  lng,
  accuracy,
}: {
  label: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}) {
  const link = mapsLink(lat, lng);
  return (
    <Field
      label={label}
      value={
        link ? (
          <Anchor href={link} target="_blank" rel="noopener noreferrer">
            {lat?.toFixed(5)}, {lng?.toFixed(5)}
            {accuracy != null ? ` (±${Math.round(accuracy)}m)` : ''}
          </Anchor>
        ) : (
          '—'
        )
      }
    />
  );
}

export function AttendanceDetailDrawer({
  attendance,
  opened,
  onClose,
  operarioName,
  supervisorLabel,
  zoneName,
}: {
  attendance: AttendanceDto | null;
  opened: boolean;
  onClose: () => void;
  operarioName: string;
  supervisorLabel: string;
  zoneName: string;
}) {
  const checkinSigId = opened && attendance?.signatureKey ? attendance.id : null;
  const checkoutSigId = opened && attendance?.checkOutSignatureKey ? attendance.id : null;
  const completed = attendance?.completedAt != null;

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title="Detalle de asistencia">
      {attendance && (
        <Stack>
          <Group justify="space-between">
            <Title order={4}>{attendance.date}</Title>
            <Badge color={completed ? 'teal' : 'yellow'} variant="light">
              {completed ? 'Completada' : 'Abierta'}
            </Badge>
          </Group>

          <Field label="Operario" value={operarioName} />
          <Field label="Supervisor" value={supervisorLabel} />
          <Field label="Zona" value={zoneName} />

          <Title order={5} mt="sm">
            Ingreso
          </Title>
          <Field label="Hora" value={formatDateTime(attendance.checkInCapturedAt)} />
          <GeoLine
            label="Ubicación"
            lat={attendance.checkInLat}
            lng={attendance.checkInLng}
            accuracy={attendance.checkInAccuracy}
          />

          <Title order={5} mt="sm">
            Salida
          </Title>
          <Field label="Hora" value={formatDateTime(attendance.checkOutCapturedAt)} />
          <GeoLine
            label="Ubicación"
            lat={attendance.checkOutLat}
            lng={attendance.checkOutLng}
            accuracy={attendance.checkOutAccuracy}
          />

          <SignatureBlock
            title="Firma de ingreso"
            signatureId={checkinSigId}
            phase="checkin"
            hasKey={attendance.signatureKey != null}
          />
          <SignatureBlock
            title="Firma de salida"
            signatureId={checkoutSigId}
            phase="checkout"
            hasKey={attendance.checkOutSignatureKey != null}
          />
        </Stack>
      )}
    </Drawer>
  );
}
