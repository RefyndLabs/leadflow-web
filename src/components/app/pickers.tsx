"use client";

import * as React from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { accounts, contacts, events, products, users } from "@/lib/api/hooks";
import { Field } from "@/components/ui/field";
import { formatPhone } from "@/lib/format";
import { Select } from "@/components/ui/input";
import { useAuth } from "./auth";

/**
 * Selects that load their options from the API. They are *controlled* (not `register`ed) because
 * the options arrive after mount — a controlled native select re-applies its value once they do.
 */
type OptionProps = { exclude?: string };

const LIMIT = { limit: 200 };

export function AccountOptions() {
  const { can } = useAuth();
  const q = accounts.useList(LIMIT, { enabled: can("accounts:read") });
  return (
    q.data?.items.map((a) => (
      <option key={a.id} value={a.id}>
        {a.name}
      </option>
    )) ?? null
  );
}

export function ContactOptions() {
  const { can } = useAuth();
  const q = contacts.useList(LIMIT, { enabled: can("contacts:read") });
  return (
    q.data?.items.map((c) => (
      <option key={c.id} value={c.id}>
        {c.name} ·{" "}
        {c.phone ? formatPhone(c.phone) : (c.email ?? "no phone or email")}
      </option>
    )) ?? null
  );
}

export function ProductOptions() {
  const { can } = useAuth();
  const q = products.useList(LIMIT, { enabled: can("catalog:read") });
  return (
    q.data?.items.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name} ({p.sku})
      </option>
    )) ?? null
  );
}

export function EventOptions() {
  const { can } = useAuth();
  const q = events.useList(LIMIT, { enabled: can("events:read") });
  return (
    q.data?.items.map((e) => (
      <option key={e.id} value={e.id}>
        {e.name}
      </option>
    )) ?? null
  );
}

export function UserOptions({ exclude }: OptionProps) {
  const { can } = useAuth();
  const q = users.useList(LIMIT, { enabled: can("users:read") });
  return (
    q.data?.items
      .filter((u) => u.is_active && u.id !== exclude)
      .map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      )) ?? null
  );
}

interface FormSelectProps<T extends FieldValues> {
  control: Control<T, unknown, never>;
  name: FieldPath<T>;
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  /** Text for the empty choice; omit for required selects with a real default. */
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/** Label + controlled native select bound to react-hook-form, with the field's error shown inline. */
export function FormSelect<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  placeholder,
  className,
  disabled,
  children,
}: FormSelectProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          label={label}
          hint={hint}
          required={required}
          error={fieldState.error?.message}
          className={className}
        >
          <Select
            name={field.name}
            ref={field.ref}
            disabled={disabled}
            value={(field.value as string | null | undefined) ?? ""}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
          >
            {placeholder !== undefined && (
              <option value="">{placeholder}</option>
            )}
            {children}
          </Select>
        </Field>
      )}
    />
  );
}
