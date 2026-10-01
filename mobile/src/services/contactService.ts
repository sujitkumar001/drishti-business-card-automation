import * as Contacts from 'expo-contacts';
import type { CardContact } from '../types';

export async function saveContact(contact: CardContact): Promise<string> {
  const permission = await Contacts.requestPermissionsAsync();

  if (permission.status !== 'granted') {
    throw new Error('Contacts permission was not granted.');
  }

  const record = await Contacts.Contact.create({
    givenName: contact.firstName || undefined,
    familyName: contact.lastName || undefined,
    company: contact.company || undefined,

    phones: contact.phone
      ? [
          {
            label: 'mobile',
            number: contact.phone,
          },
        ]
      : undefined,

    emails: contact.email
      ? [
          {
            label: 'work',
            address: contact.email,
          },
        ]
      : undefined,
  });

  if (!record.id) {
    throw new Error('Contact was created but no contact ID was returned.');
  }

  return record.id;
}
