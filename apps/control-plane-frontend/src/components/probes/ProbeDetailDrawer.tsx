import { Badge, Button, DataList, HStack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { ProbeForm } from '@/components/probes/ProbeForm';
import { Drawer, StatusBadge, Tooltip } from '@/components/ui';
import { hasDrift, relativeTime, shortSha } from '@/lib/format';
import { toPatchProbeInput, validateProbeForm } from '@/lib/probeForm';
import { usePatchProbe } from '@/lib/queries';
import { deriveDisplayStatus } from '@/lib/status';

import type { ProbeFormValues } from '@/lib/probeForm';
import type { Probe } from '@railway-latency/types';

interface ProbeDetailDrawerProps {
  probe: Probe | null;
  latestSha: string | null;
  onClose: () => void;
}

function valuesFromProbe(probe: Probe): ProbeFormValues {
  return {
    probeId: probe.probeId,
    lat: String(probe.lat),
    lon: String(probe.lon),
    host: probe.host ?? '',
  };
}

function ProbeDetailContent({
  latestSha,
  onClose,
  probe,
}: {
  probe: Probe;
  latestSha: string | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ProbeFormValues>(() =>
    valuesFromProbe(probe),
  );
  const [showErrors, setShowErrors] = useState(false);
  const patchProbe = usePatchProbe(probe.probeId);

  const errors = validateProbeForm(values, { includeProbeId: false });
  const display = deriveDisplayStatus(probe.status, probe.lastSeen);
  const drifted = hasDrift(probe.deployedSha, latestSha);

  function handleSave() {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    patchProbe.mutate(toPatchProbeInput(values), {
      onSuccess: () => setEditing(false),
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <Text as="span" fontFamily="mono">
          {probe.probeId}
        </Text>
      }
      footer={
        editing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="gray"
              onClick={() => {
                setValues(valuesFromProbe(probe));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={patchProbe.isPending}
            >
              {patchProbe.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="gray"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              size="sm"
              variant="outline"
              colorPalette="gray"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          </>
        )
      }
    >
      {editing ? (
        <ProbeForm
          values={values}
          errors={showErrors ? errors : {}}
          onChange={setValues}
          includeProbeId={false}
          disabled={patchProbe.isPending}
        />
      ) : (
        <DataList.Root orientation="horizontal" size="sm">
          <DataList.Item>
            <DataList.ItemLabel>Status</DataList.ItemLabel>
            <DataList.ItemValue>
              <StatusBadge status={display} />
            </DataList.ItemValue>
          </DataList.Item>

          <DataList.Item>
            <DataList.ItemLabel>Coordinates</DataList.ItemLabel>
            <DataList.ItemValue fontFamily="mono">
              {probe.lat}, {probe.lon}
            </DataList.ItemValue>
          </DataList.Item>

          <DataList.Item>
            <DataList.ItemLabel>Deployed SHA</DataList.ItemLabel>
            {probe.deployedSha ? (
              <DataList.ItemValue fontFamily="mono">
                <HStack gap="1.5">
                  {shortSha(probe.deployedSha)}
                  {drifted && (
                    <Tooltip
                      content={`Drifted from latest (${shortSha(latestSha)})`}
                    >
                      <Badge variant="subtle" colorPalette="orange">
                        drift
                      </Badge>
                    </Tooltip>
                  )}
                </HStack>
              </DataList.ItemValue>
            ) : (
              <DataList.ItemValue color="fg.subtle">
                not deployed
              </DataList.ItemValue>
            )}
          </DataList.Item>

          <DataList.Item>
            <DataList.ItemLabel>Host</DataList.ItemLabel>
            <DataList.ItemValue fontFamily="mono">
              {probe.host ?? '—'}
            </DataList.ItemValue>
          </DataList.Item>

          <DataList.Item>
            <DataList.ItemLabel>Last seen</DataList.ItemLabel>
            <DataList.ItemValue fontFamily="mono">
              {relativeTime(probe.lastSeen)}
            </DataList.ItemValue>
          </DataList.Item>
        </DataList.Root>
      )}
    </Drawer>
  );
}

export function ProbeDetailDrawer({
  latestSha,
  onClose,
  probe,
}: ProbeDetailDrawerProps) {
  if (!probe) return null;

  return (
    <ProbeDetailContent
      key={probe.probeId}
      probe={probe}
      latestSha={latestSha}
      onClose={onClose}
    />
  );
}
