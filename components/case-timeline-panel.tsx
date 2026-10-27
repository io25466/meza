import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/app-text";
import { useColors } from "@/hooks/use-colors";
import { buildCaseTimeline, type CaseTimelineEvent } from "@/lib/case-timeline";
import type { AppData } from "@/lib/models";

const eventIcons: Record<
  CaseTimelineEvent["type"],
  keyof typeof MaterialCommunityIcons.glyphMap
> = {
  appointment: "calendar-clock-outline",
  task: "checkbox-marked-circle-outline",
  payment: "cash-check",
  power: "file-certificate-outline",
  file: "file-lock-outline",
  expense: "cash-minus",
  audit: "clipboard-text-clock-outline",
};

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ar-SY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CaseTimelinePanel({
  data,
  caseId,
}: {
  data: AppData;
  caseId: string;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const events = useMemo(() => buildCaseTimeline(data, caseId), [data, caseId]);

  return (
    <View
      style={{
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 9,
      }}
    >
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? "إخفاء الخط الزمني للقضية" : "عرض الخط الزمني للقضية"
        }
        style={{
          flexDirection: "row-reverse",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 38,
        }}
      >
        <View
          style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}
        >
          <MaterialCommunityIcons
            name="timeline-clock-outline"
            size={18}
            color={colors.tint}
          />
          <Text style={{ color: colors.tint, fontSize: 12, fontWeight: "700" }}>
            الخط الزمني للقضية
          </Text>
          <Text style={{ color: colors.muted, fontSize: 10 }}>
            ({events.length})
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.muted}
        />
      </Pressable>
      {expanded ? (
        events.length ? (
          <View style={{ gap: 0, paddingTop: 5 }}>
            {events.map((event, index) => (
              <View
                key={event.id}
                style={{
                  flexDirection: "row-reverse",
                  gap: 9,
                  paddingVertical: 8,
                }}
              >
                <View style={{ alignItems: "center", width: 22 }}>
                  <MaterialCommunityIcons
                    name={eventIcons[event.type]}
                    size={17}
                    color={colors.tint}
                  />
                  {index < events.length - 1 ? (
                    <View
                      style={{
                        width: 1,
                        flex: 1,
                        minHeight: 18,
                        backgroundColor: colors.border,
                        marginTop: 5,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 5 }}>
                  <Text
                    style={{
                      color: colors.text,
                      textAlign: "right",
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {event.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      textAlign: "right",
                      fontSize: 10,
                      lineHeight: 16,
                      marginTop: 2,
                    }}
                  >
                    {event.detail}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      textAlign: "right",
                      fontSize: 9,
                      marginTop: 3,
                    }}
                  >
                    {formatEventDate(event.at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text
            style={{
              color: colors.muted,
              textAlign: "right",
              fontSize: 11,
              paddingVertical: 10,
            }}
          >
            لا توجد أحداث مرتبطة بهذه القضية بعد.
          </Text>
        )
      ) : null}
    </View>
  );
}
